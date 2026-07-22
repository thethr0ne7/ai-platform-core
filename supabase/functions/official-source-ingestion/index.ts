import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type TriggerPayload = {
  trigger?: "scheduled" | "manual";
  max_sources?: number;
  max_items_per_source?: number;
};

type OfficialSource = {
  id: string;
  source_key: string;
  name: string;
  authority: string;
  level: string;
  region: string | null;
  base_url: string;
  status: string;
  priority: number;
  cadence_minutes: number;
  last_checked_at: string | null;
  metadata: Record<string, unknown> | null;
};

type Endpoint = {
  id: string;
  source_id: string;
  url: string;
  priority: number;
  active: boolean;
};

type Probe = {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  raw: string;
  text: string;
  latencyMs: number;
  errorType: string | null;
  error: string | null;
};

type SourceResult = {
  sourceKey: string;
  name: string;
  status: "healthy" | "degraded" | "blocked";
  successfulUrl: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  persisted: number;
  childFailures: number;
  errorType: string | null;
  error: string | null;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 GovernmentIntelligence/0.59";
const MAX_BYTES = 2_500_000;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,x-scheduler-token",
      },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = request.headers.get("x-scheduler-token")?.trim();
  if (!token) return json({ error: "missing_scheduler_token" }, 401);

  const { data: verified, error: verificationError } = await supabase.rpc("gi_verify_scheduler_token", {
    p_token_hash: await sha256(token),
  });
  if (verificationError || verified !== true) return json({ error: "invalid_scheduler_token" }, 403);

  const payload = await safeJson<TriggerPayload>(request);
  const trigger = payload.trigger === "manual" ? "manual" : "scheduled";
  const maxSources = clamp(payload.max_sources, 1, 100, 50);
  const maxItems = clamp(payload.max_items_per_source, 1, 6, 3);

  const { data: run, error: runError } = await supabase
    .from("gi_ingestion_runs")
    .insert({ trigger_type: trigger, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "run_initialization_failed", detail: runError?.message }, 500);

  const startedAt = Date.now();
  const runId = String(run.id);

  try {
    const { data: sourceRows, error: sourceError } = await supabase
      .from("gi_official_sources")
      .select("id,source_key,name,authority,level,region,base_url,status,priority,cadence_minutes,last_checked_at,metadata")
      .eq("active", true)
      .limit(100);
    if (sourceError) throw sourceError;

    const sources = ((sourceRows ?? []) as OfficialSource[])
      .filter((source) => trigger === "manual" || isDue(source))
      .sort(compareSources)
      .slice(0, maxSources);

    const endpointMap = new Map<string, Endpoint[]>();
    if (sources.length) {
      const { data: endpointRows, error: endpointError } = await supabase
        .from("gi_source_endpoints")
        .select("id,source_id,url,priority,active")
        .in("source_id", sources.map((source) => source.id))
        .eq("active", true)
        .order("priority", { ascending: true });
      if (endpointError) throw endpointError;

      for (const endpoint of (endpointRows ?? []) as Endpoint[]) {
        const list = endpointMap.get(endpoint.source_id) ?? [];
        list.push(endpoint);
        endpointMap.set(endpoint.source_id, list);
      }
    }

    const results = await mapLimit(sources, 5, (source) =>
      processSource(source, endpointMap.get(source.id) ?? [], maxItems),
    );

    const healthy = results.filter((item) => item.status === "healthy").length;
    const degraded = results.filter((item) => item.status === "degraded").length;
    const blocked = results.filter((item) => item.status === "blocked").length;
    const persisted = results.reduce((sum, item) => sum + item.persisted, 0);
    const failed = degraded + blocked;
    const status = failed ? "completed_with_errors" : "completed";

    await supabase
      .from("gi_ingestion_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        sources_processed: results.length,
        discovered_count: results.length,
        persisted_count: persisted,
        skipped_count: 0,
        failed_count: failed,
        result: { engine: "official-source-ingestion-v0.59", trigger, healthy, degraded, blocked, results },
      })
      .eq("id", runId);

    return json({ runId, status, healthy, degraded, blocked, results });
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

async function processSource(source: OfficialSource, endpoints: Endpoint[], maxItems: number): Promise<SourceResult> {
  const checkedAt = new Date().toISOString();
  const candidates = buildCandidates(source, endpoints);
  const attempts: Probe[] = [];
  let landing: Probe | null = null;
  let landingEndpoint: Endpoint | null = null;

  for (const candidate of candidates) {
    const probe = await probeUrl(candidate.url);
    attempts.push(probe);

    if (candidate.endpointId) {
      await supabase
        .from("gi_source_endpoints")
        .update({
          last_checked_at: checkedAt,
          ...(probe.ok ? { last_success_at: checkedAt } : {}),
          metadata: {
            health_engine: "edge-v0.59",
            http_status: probe.statusCode || null,
            final_url: probe.finalUrl,
            latency_ms: probe.latencyMs,
            error_type: probe.errorType,
          },
          updated_at: checkedAt,
        })
        .eq("id", candidate.endpointId);
    }

    if (probe.ok) {
      landing = probe;
      landingEndpoint = candidate.endpointId
        ? endpoints.find((endpoint) => endpoint.id === candidate.endpointId) ?? null
        : null;
      break;
    }
  }

  if (!landing) {
    const blocked = attempts.length > 0 && attempts.every((attempt) =>
      [401, 403, 429].includes(attempt.statusCode) || attempt.errorType === "access_blocked"
    );
    const last = attempts.at(-1) ?? null;
    const status: "blocked" | "degraded" = blocked ? "blocked" : "degraded";
    const errorType = last?.errorType ?? "unreachable";
    const error = last?.error ?? "Источник не ответил ни по одному адресу";

    await recordHealth(source.source_key, status, checkedAt, errorType, error, {
      attempted_urls: candidates.map((item) => item.url),
      attempts: attempts.map((attempt) => ({
        url: attempt.requestedUrl,
        final_url: attempt.finalUrl,
        status: attempt.statusCode,
        latency_ms: attempt.latencyMs,
        error_type: attempt.errorType,
        error: attempt.error,
      })),
    });
    await supabase.from("gi_ingestion_failures").insert({
      source_key: source.source_key,
      error_message: `${error} [${candidates[0]?.url ?? source.base_url}]`.slice(0, 2000),
      checked_at: checkedAt,
      metadata: { engine: "edge-v0.59", error_type: errorType },
    });

    return {
      sourceKey: source.source_key,
      name: source.name,
      status,
      successfulUrl: null,
      statusCode: last?.statusCode || null,
      latencyMs: last?.latencyMs ?? null,
      persisted: 0,
      childFailures: 0,
      errorType,
      error,
    };
  }

  const pages: Probe[] = [landing];
  let childFailures = 0;
  const targets = discoverTargets(landing.finalUrl, landing.raw, Math.max(0, maxItems - 1));
  for (const target of targets) {
    const page = await probeUrl(target);
    if (page.ok) pages.push(page);
    else childFailures += 1;
  }

  let persisted = 0;
  for (const page of pages) {
    if (!page.text || page.text.length < 100) continue;
    const { error: persistError } = await supabase.rpc("gi_persist_source_evidence", {
      p_record: {
        source_id: source.source_key,
        canonical_url: page.finalUrl,
        title: extractTitle(page.raw) || source.name,
        authority: source.authority,
        checked_at: checkedAt,
        content_hash: await sha256(page.text),
        extracted_text: page.text,
        extraction_method: page.contentType.includes("html") ? "edge-html-v059" : "edge-text-v059",
        citations: [{ locator: "body", quote: page.text.slice(0, 700) }],
        metadata: {
          ingestion_runtime: "supabase-edge-v0.59",
          source_level: source.level,
          region: source.region,
          content_type: page.contentType,
          http_status: page.statusCode,
          latency_ms: page.latencyMs,
        },
      },
    });
    if (persistError) childFailures += 1;
    else persisted += 1;
  }

  if (!landingEndpoint && landing.finalUrl !== source.base_url) {
    await supabase.from("gi_source_endpoints").upsert(
      {
        source_id: source.id,
        endpoint_type: "homepage",
        url: landing.finalUrl,
        active: true,
        priority: Math.max(1, source.priority - 1),
        discovery_method: "health_fallback_v059",
        parser_hint: "edge_fetch",
        last_checked_at: checkedAt,
        last_success_at: checkedAt,
        metadata: { original_url: source.base_url },
        updated_at: checkedAt,
      },
      { onConflict: "source_id,url" },
    );
  }

  await recordHealth(source.source_key, "healthy", checkedAt, null, null, {
    successful_url: landing.finalUrl,
    requested_url: landing.requestedUrl,
    http_status: landing.statusCode,
    latency_ms: landing.latencyMs,
    persisted,
    child_failures: childFailures,
  });

  return {
    sourceKey: source.source_key,
    name: source.name,
    status: "healthy",
    successfulUrl: landing.finalUrl,
    statusCode: landing.statusCode,
    latencyMs: landing.latencyMs,
    persisted,
    childFailures,
    errorType: null,
    error: null,
  };
}

async function recordHealth(
  sourceKey: string,
  status: "healthy" | "degraded" | "blocked",
  checkedAt: string,
  errorType: string | null,
  error: string | null,
  metadata: Record<string, unknown>,
) {
  const { error: healthError } = await supabase.rpc("gi_record_source_health", {
    p_source_key: sourceKey,
    p_status: status,
    p_error_type: errorType,
    p_last_error: error,
    p_adapter_used: "edge-browser-fetch-v059",
    p_checked_at: checkedAt,
    p_metadata: metadata,
  });
  if (healthError) throw healthError;
}

function buildCandidates(source: OfficialSource, endpoints: Endpoint[]) {
  const result: Array<{ url: string; endpointId: string | null }> = [];
  const seen = new Set<string>();

  const add = (value: string, endpointId: string | null) => {
    for (const url of urlVariants(value)) {
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({ url, endpointId });
    }
  };

  for (const endpoint of [...endpoints].sort((a, b) => a.priority - b.priority)) add(endpoint.url, endpoint.id);
  add(source.base_url, null);

  const fallbackValue = source.metadata?.fallback_urls;
  const fallbacks = Array.isArray(fallbackValue)
    ? fallbackValue.filter((item): item is string => typeof item === "string")
    : [];
  for (const fallback of fallbacks) add(fallback, null);

  return result.slice(0, 8);
}

function urlVariants(value: string): string[] {
  try {
    const original = new URL(value);
    original.protocol = "https:";
    original.hash = "";
    const variants = [canonicalize(original)];
    const host = original.hostname;

    if (host.startsWith("www.")) {
      const alternate = new URL(original);
      alternate.hostname = host.slice(4);
      variants.push(canonicalize(alternate));
    } else if (!host.endsWith(".gov.ru") && !host.endsWith(".kbr.ru")) {
      const alternate = new URL(original);
      alternate.hostname = `www.${host}`;
      variants.push(canonicalize(alternate));
    }

    return [...new Set(variants)];
  } catch {
    return [];
  }
}

async function probeUrl(requestedUrl: string): Promise<Probe> {
  const startedAt = Date.now();
  let currentUrl = requestedUrl;

  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      assertPublicHttps(currentUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22_000);
      let response: Response;

      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.3",
            "accept-language": "ru-RU,ru;q=0.9,en;q=0.6",
            "cache-control": "no-cache",
          },
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`redirect_without_location:${response.status}`);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!response.ok) {
        return failureProbe(
          requestedUrl,
          currentUrl,
          response.status,
          latencyMs,
          [401, 403, 429].includes(response.status) ? "access_blocked" : `http_${response.status}`,
          `HTTP ${response.status}`,
        );
      }

      const declaredSize = Number(response.headers.get("content-length") ?? "0");
      if (declaredSize > MAX_BYTES) {
        return successProbe(requestedUrl, response.url || currentUrl, response.status, contentType, "", "", latencyMs);
      }

      const raw = await readLimitedText(response, MAX_BYTES);
      const text = isTextual(contentType)
        ? contentType.includes("html")
          ? htmlToText(raw)
          : normalizeText(raw)
        : "";

      if (isTextual(contentType) && text.length < 40) {
        return failureProbe(
          requestedUrl,
          response.url || currentUrl,
          response.status,
          latencyMs,
          "content_too_short",
          "Ответ получен, но полезный текст отсутствует",
          contentType,
          raw,
          text,
        );
      }

      return successProbe(requestedUrl, response.url || currentUrl, response.status, contentType, raw, text, latencyMs);
    }
    throw new Error("too_many_redirects");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const type = /abort/i.test(message)
      ? "timeout"
      : /dns|resolve|name/i.test(message)
        ? "dns_error"
        : /certificate|tls|ssl/i.test(message)
          ? "tls_error"
          : /private_network/i.test(message)
            ? "unsafe_redirect"
            : "network_error";
    return failureProbe(requestedUrl, currentUrl, 0, Date.now() - startedAt, type, message);
  }
}

function successProbe(
  requestedUrl: string,
  finalUrl: string,
  statusCode: number,
  contentType: string,
  raw: string,
  text: string,
  latencyMs: number,
): Probe {
  return { ok: true, requestedUrl, finalUrl, statusCode, contentType, raw, text, latencyMs, errorType: null, error: null };
}

function failureProbe(
  requestedUrl: string,
  finalUrl: string,
  statusCode: number,
  latencyMs: number,
  errorType: string,
  error: string,
  contentType = "",
  raw = "",
  text = "",
): Probe {
  return { ok: false, requestedUrl, finalUrl, statusCode, contentType, raw, text, latencyMs, errorType, error };
}

function discoverTargets(baseUrl: string, html: string, limit: number): string[] {
  if (!html || limit <= 0) return [];
  const base = new URL(baseUrl);
  const candidates: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], base);
      if (url.protocol !== "https:" || url.hostname !== base.hostname) continue;
      if (/\.(?:jpg|jpeg|png|webp|gif|svg|zip|rar|7z|mp4|mp3)$/i.test(url.pathname)) continue;
      const canonical = canonicalize(url);
      if (seen.has(canonical) || canonical === canonicalize(base)) continue;
      seen.add(canonical);
      const hint = `${url.pathname} ${htmlToText(match[2])}`;
      const score = /(поддерж|субсид|грант|программ|документ|постанов|приказ|новост|меры|конкурс|закуп|торг|инвест|льгот)/i.test(hint) ? 10 : 1;
      candidates.push({ url: canonical, score });
    } catch {
      // Пропускаем повреждённые ссылки.
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.url);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - total;
    if (remaining <= 0) break;
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) break;
  }
  await reader.cancel().catch(() => undefined);

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

function htmlToText(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? htmlToText(match[1]) : "";
  return title.slice(0, 300) || undefined;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTextual(contentType: string): boolean {
  return !contentType || contentType.includes("text/") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("javascript");
}

function canonicalize(url: URL): string {
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|yclid$|gclid$|_openstat$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function assertPublicHttps(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("https_required");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
  ) throw new Error("private_network_target_rejected");
}

function isDue(source: OfficialSource): boolean {
  if (!source.last_checked_at) return true;
  if (["pending", "degraded", "blocked"].includes(source.status)) return true;
  const checkedAt = new Date(source.last_checked_at).getTime();
  const cadenceMs = Math.max(15, source.cadence_minutes || 1440) * 60_000;
  return Number.isNaN(checkedAt) || checkedAt + cadenceMs <= Date.now();
}

function compareSources(a: OfficialSource, b: OfficialSource): number {
  const rank = (status: string) => ["pending", "degraded", "blocked"].includes(status) ? 0 : 1;
  return rank(a.status) - rank(b.status) || a.priority - b.priority || a.source_key.localeCompare(b.source_key);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
