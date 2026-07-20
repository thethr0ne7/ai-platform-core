import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

interface TriggerPayload {
  trigger?: "scheduled" | "manual";
  max_sources?: number;
  max_items_per_source?: number;
}

interface OfficialSource {
  source_key: string;
  name: string;
  authority: string;
  level: string;
  region: string | null;
  base_url: string;
}

interface SourceTotals {
  sourceId: string;
  discovered: number;
  persisted: number;
  skipped: number;
  failed: number;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = request.headers.get("x-scheduler-token")?.trim();
  if (!token) return json({ error: "missing_scheduler_token" }, 401);

  const tokenHash = await sha256(token);
  const { data: verified, error: verificationError } = await supabase.rpc("gi_verify_scheduler_token", {
    p_token_hash: tokenHash,
  });
  if (verificationError || verified !== true) return json({ error: "invalid_scheduler_token" }, 403);

  const payload = await safeJson<TriggerPayload>(request);
  const trigger = payload.trigger === "manual" ? "manual" : "scheduled";
  const maxSources = clampInteger(payload.max_sources, 1, 50, 10);
  const maxItemsPerSource = clampInteger(payload.max_items_per_source, 1, 50, 12);

  const { data: run, error: runError } = await supabase
    .from("gi_ingestion_runs")
    .insert({ trigger_type: trigger, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "run_initialization_failed", detail: runError?.message }, 500);

  const runId = run.id as string;
  const startedAt = Date.now();

  try {
    const { data: sources, error: sourceError } = await supabase
      .from("gi_official_sources")
      .select("source_key,name,authority,level,region,base_url")
      .eq("active", true)
      .order("level", { ascending: true })
      .limit(maxSources);
    if (sourceError) throw sourceError;

    const results: SourceTotals[] = [];
    for (const source of (sources ?? []) as OfficialSource[]) {
      results.push(await ingestSource(source, maxItemsPerSource));
    }

    const totals = results.reduce(
      (acc, item) => ({
        discovered: acc.discovered + item.discovered,
        persisted: acc.persisted + item.persisted,
        skipped: acc.skipped + item.skipped,
        failed: acc.failed + item.failed,
      }),
      { discovered: 0, persisted: 0, skipped: 0, failed: 0 },
    );

    const status = totals.failed > 0 ? "completed_with_errors" : "completed";
    await supabase
      .from("gi_ingestion_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        sources_processed: results.length,
        discovered_count: totals.discovered,
        persisted_count: totals.persisted,
        skipped_count: totals.skipped,
        failed_count: totals.failed,
        result: { results, totals },
      })
      .eq("id", runId);

    return json({ runId, status, results, totals });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("gi_ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_message: message,
      })
      .eq("id", runId);
    return json({ runId, status: "failed", error: message }, 500);
  }
});

async function ingestSource(source: OfficialSource, maxItems: number): Promise<SourceTotals> {
  const checkedAt = new Date().toISOString();
  const result: SourceTotals = { sourceId: source.source_key, discovered: 0, persisted: 0, skipped: 0, failed: 0 };

  try {
    const baseUrl = assertSafeOfficialUrl(source.base_url, source.base_url);
    const landing = await fetchText(baseUrl);
    const targets = discoverSameHostTargets(baseUrl, landing.text, maxItems);
    result.discovered = targets.length;

    for (const target of targets) {
      try {
        const page = target === baseUrl ? landing : await fetchText(assertSafeOfficialUrl(source.base_url, target));
        const text = page.contentType.includes("text/html") ? htmlToText(page.text) : normalizeText(page.text);
        if (text.length < 100) {
          result.skipped += 1;
          continue;
        }

        const contentHash = await sha256(text);
        const { data: latest, error: latestError } = await supabase.rpc("gi_get_latest_source_text", {
          p_canonical_url: target,
        });
        if (latestError) throw latestError;
        if (typeof latest === "string" && normalizeText(latest) === text) {
          result.skipped += 1;
          continue;
        }

        const title = extractTitle(page.text) || source.name;
        const { error: persistError } = await supabase.rpc("gi_persist_source_evidence", {
          p_record: {
            source_id: source.source_key,
            canonical_url: target,
            title,
            authority: source.authority,
            checked_at: checkedAt,
            content_hash: contentHash,
            extracted_text: text,
            extraction_method: page.contentType.includes("text/html") ? "html" : "native-document",
            citations: [{ locator: "body", quote: text.slice(0, 500) }],
            metadata: {
              ingestion_runtime: "supabase-edge-v0.38",
              source_level: source.level,
              region: source.region,
              content_type: page.contentType,
            },
          },
        });
        if (persistError) throw persistError;
        result.persisted += 1;
      } catch (error) {
        result.failed += 1;
        await recordFailure(source.source_key, error, checkedAt, target);
      }
    }

    await supabase
      .from("gi_official_sources")
      .update({
        last_checked_at: checkedAt,
        last_success_at: result.persisted > 0 || result.skipped > 0 ? checkedAt : null,
        status: result.failed > 0 ? "degraded" : "active",
        updated_at: checkedAt,
      })
      .eq("source_key", source.source_key);
  } catch (error) {
    result.failed += 1;
    await recordFailure(source.source_key, error, checkedAt, source.base_url);
    await supabase
      .from("gi_official_sources")
      .update({ last_checked_at: checkedAt, status: "error", updated_at: checkedAt })
      .eq("source_key", source.source_key);
  }

  return result;
}

async function fetchText(url: string): Promise<{ text: string; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "GovernmentIntelligenceBot/0.38 (+official-source-monitoring)",
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`unsupported_content_type:${contentType || "unknown"}`);
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 2_500_000) throw new Error("document_too_large");
    return { text: await response.text(), contentType };
  } finally {
    clearTimeout(timer);
  }
}

function discoverSameHostTargets(baseUrl: string, html: string, limit: number): string[] {
  const base = new URL(baseUrl);
  const targets = new Set<string>([canonicalize(base)]);
  const linkPattern = /href\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(linkPattern)) {
    if (targets.size >= limit) break;
    try {
      const candidate = new URL(match[1], base);
      if (candidate.protocol !== "https:" || candidate.hostname !== base.hostname) continue;
      if (/\.(?:pdf|docx?|xlsx?|zip|rar|7z|jpg|jpeg|png|webp)$/i.test(candidate.pathname)) continue;
      targets.add(canonicalize(candidate));
    } catch {
      // Ignore malformed links discovered in third-party markup.
    }
  }
  return [...targets].slice(0, limit);
}

function assertSafeOfficialUrl(baseUrl: string, candidate: string): string {
  const base = new URL(baseUrl);
  const url = new URL(candidate, base);
  if (url.protocol !== "https:") throw new Error("https_required");
  if (url.hostname !== base.hostname) throw new Error("cross_host_redirect_rejected");
  if (/^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) {
    throw new Error("private_network_target_rejected");
  }
  return canonicalize(url);
}

function canonicalize(url: URL): string {
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|yclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function htmlToText(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'"),
  );
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? htmlToText(match[1]) : "";
  return title.slice(0, 500) || undefined;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function recordFailure(sourceId: string, error: unknown, checkedAt: string, url: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await supabase.rpc("gi_record_ingestion_failure", {
    p_source_id: sourceId,
    p_error_message: `${message} [${url}]`.slice(0, 2000),
    p_checked_at: checkedAt,
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
