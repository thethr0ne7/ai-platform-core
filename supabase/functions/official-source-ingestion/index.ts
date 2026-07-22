import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

interface TriggerPayload {
  trigger?: "scheduled" | "manual";
  max_sources?: number;
  max_items_per_source?: number;
}

interface OfficialSource {
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
}

interface SourceEndpoint {
  id: string;
  source_id: string;
  endpoint_type: string;
  url: string;
  priority: number;
  active: boolean;
}

interface FetchResult {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  raw: string;
  latencyMs: number;
  adapter: string;
  errorType: string | null;
  error: string | null;
}

interface SourceResult {
  sourceKey: string;
  name: string;
  status: "healthy" | "degraded" | "blocked";
  checkedAt: string;
  successfulUrl: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  persisted: number;
  discovered: number;
  skipped: number;
  childFailures: number;
  errorType: string | null;
  error: string | null;
  adapter: string | null;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_BODY_BYTES = 2_500_000;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 GovernmentIntelligence/0.59";

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

  const tokenHash = await sha256(token);
  const { data: verified, error: verificationError } = await supabase.rpc("gi_verify_scheduler_token", {
    p_token_hash: tokenHash,
  });
  if (verificationError || verified !== true) return json({ error: "invalid_scheduler_token" }, 403);

  const payload = await safeJson<TriggerPayload>(request);
  const trigger = payload.trigger === "manual" ? "manual" : "scheduled";
  const maxSources = clampInteger(payload.max_sources, 1, 100, 50);
  const maxItemsPerSource = clampInteger(payload.max_items_per_source, 1, 10, 4);

  const { data: run, error: runError } = await supabase
    .from("gi_ingestion_runs")
    .insert({ trigger_type: trigger, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "run_initialization_failed", detail: runError?.message }, 500);

  const runId = run.id as string;
  const startedAt = Date.now();

  try {
    const { data: sourceRows, error: sourceError } = await supabase
      .from("gi_official_sources")
      .select("id,source_key,name,authority,level,region,base_url,status,priority,cadence_minutes,last_checked_at,metadata")
      .eq("active", true)
      .limit(100);
    if (sourceError) throw sourceError;

    const allSources = ((sourceRows ?? []) as OfficialSource[])
      .filter((source) => trigger === "manual" || isDue(source))
      .sort(compareSources)
      .slice(0, maxSources);

    const sourceIds = allSources.map((source) => source.id);
    const endpointMap = new Map<string, SourceEndpoint[]>();
    if (sourceIds.length) {
      const { data: endpointRows, error: endpointError } = await supabase
        .from("gi_source_endpoints")
        .select("id,source_id,endpoint_type,url,priority,active")
        .in("source_id", sourceIds)
        .eq("active", true)
        .order("priority", { ascending: true });
      if (endpointError) throw endpointError;

      for (const endpoint of (endpointRows ?? []) as SourceEndpoint[]) {
        const list = endpointMap.get(endpoint.source_id) ?? [];
        list.push(endpoint);
        endpointMap.set(endpoint.source_id, list);
      }
    }

    const results = await mapLimit(allSources, 5, (source) =>
      inspectSource(source, endpointMap.get(source.id) ?? [], maxItemsPerSource),
    );

    const healthy = results.filter((item) => item.status === "healthy").length;
    const blocked = results.filter((item) => item.status === "blocked").length;
    const degraded = results.filter((item) => item.status === "degraded").length;
    const persisted = results.reduce((total, item) => total + item.persisted, 0);
    const discovered = results.reduce((total, item) => total + item.discovered, 0);
    const skipped = results.reduce((total, item) => total + item.skipped, 0);
    const failed = blocked + degraded;
    const status = failed > 0 ? "completed_with_errors" : "completed";

    await supabase
      .from("gi_ingestion_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        sources_processed: results.length,
        discovered_count: discovered,
        persisted_count: persisted,
        skipped_count: skipped,
        failed_count: failed,
        result: {
          engine: "official-source-ingestion-v0.59",
          trigger,
          healthy,
          degraded,
          blocked,
          results,
        },
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

async function inspectSource(
  source: OfficialSource,
  endpoints: SourceEndpoint[],
  maxItems: number,
): Promise<SourceResult> {
  const checkedAt = new Date().toISOString();
  const candidates = buildCandidates(source, endpoints);
  const attempts: FetchResult[] = [];
  let landing: FetchResult | null = null;
  let successfulEndpoint: SourceEndpoint | null = null;

  for (const candidate of candidates) {
    const attempt = await fetchOfficial(candidate.url);
    attempts.push(attempt);

    if (candidate.endpointId) {
      await supabase
        .from("gi_source_endpoints")
        .update({
          last_checked_at: checkedAt,
          ...(attempt.ok ? { last_success_at: checkedAt } : {}),
          metadata: {
            health_engine: "edge-v0.59",
            http_status: attempt.status || null,
            final_url: attempt.finalUrl,
            latency_ms: attempt.latencyMs,
            error_type: attempt.errorType,
          },
          updated_at: checkedAt,
        })
        .eq("id", candidate.endpointId);
    }

    if (attempt.ok) {
      landing = attempt;
      successfulEndpoint = candidate.endpointId
        ? endpoints.find((endpoint) => endpoint.id === candidate.endpointId) ?? null
        : null;
      break;
    }
  }

  if (!landing) {
    const blocked = attempts.length > 0 && attempts.every((item) =>
      item.status === 401 || item.status === 403 || item.status === 429 || item.errorType === "access_blocked"
    );
    const latest = attempts.at(-1);
    const status: "blocked" | "degraded" = blocked ? "blocked" : "degraded";
    const errorType = latest?.errorType ?? "unreachable";
    const error = latest?.error ?? "Источник не ответил ни по одному адресу";

    await recordHealth(source, status, checkedAt, latest ?? null, errorType, error, {
      attempted_urls: candidates.map((item) => item.url),
      attempts: attempts.map(compactAttempt),
    });
    await recordFailure(source.source_key, error, checkedAt, candidates[0]?.url ?? source.base_url, errorType);

    return {
      sourceKey: source.source_key,
      name: source.name,
      status,
      checkedAt,
      successfulUrl: null,
      httpStatus: latest?.status || null,
      latencyMs: latest?.latencyMs ?? null,
      persisted: 0,
      discovered: 0,
      skipped: 0,
      childFailures: 0,
      errorType,
      error,
      adapter: latest?.adapter ?? null,
    };
  }

  let persisted = 0;
  let skipped = 0;
  let childFailures = 0;
  const discoveredTargets = landing.text
    ? discoverUsefulTargets(landing.finalUrl, landing.raw, Math.max(0, maxItems - 1))
    : [];
  const pages: FetchResult[] = [landing];

  for (const target of discoveredTargets) {
    const page = await fetchOfficial(target);
    if (page.ok) pages.push(page);
    else childFailures += 1;
  }

  for (const page of pages) {
    if (!page.text || page.text.length < 100) {
      skipped += 1;
      continue;
    }

    const title = extractTitle(page.raw) || source.name;
    const contentHash = await sha256(page.text);
    const { error: persistError } = await supabase.rpc("gi_persist_source_evidence", {
      p_record: {
        source_id: source.source_key,
        canonical_url: page.finalUrl,
        title,
        authority: source.authority,
        checked_at: checkedAt,
        content_hash: contentHash,
        extracted_text: page.text,
        extraction_method: page.contentType.includes("html") ? "edge-html-v059" : "edge-text-v059",
        citations: [{ locator: "body", quote: page.text.slice(0, 700) }],
        metadata: {
          ingestion_runtime: "supabase-edge-v0.59",
          source_level: source.level,
          region: source.region,
          content_type: page.contentType,
          http_status: page.status,
          final_url: page.finalUrl,
          latency_ms: page.latencyMs,
        },
      },
    });

    if (persistError) {
      childFailures += 1;
    } else {
      persisted += 1;
    }
  }

  if (!successfulEndpoint && landing.finalUrl !== source.base_url) {
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
        metadata: { original_url: source.base_url, adapter: landing.adapter },
        updated_at: checkedAt,
      },
      { onConflict: "source_id,url" },
    );
  }

  await recordHealth(source, "healthy", checkedAt, landing, null, null, {
    successful_url: landing.finalUrl,
    requested_url: landing.requestedUrl,
    http_status: landing.status,
    latency_ms: landing.latencyMs,
    persisted,
    discovered: discoveredTargets.length,
    child_failures: childFailures,
    attempted_urls: attempts.map((item) => item.requestedUrl),
  });

  return {
    sourceKey: source.source_key,
    name: source.name,
    status: "healthy",
    checkedAt,
    successfulUrl: landing.finalUrl,
    httpStatus: landing.status,
    latencyMs: landing.latencyMs,
    persisted,
    discovered: discoveredTargets.length,
    skipped,
    childFailures,
    errorType: null,
    error: null,
    adapter: landing.adapter,
  };
}

function buildCandidates(source: OfficialSource, endpoints: SourceEndpoint[]) {
  const candidates: Array<{ url: string; endpointId: string | null }> = [];
  const seen = new Set<string>();

  const add = (value: string, endpointId: string | null) => {
    for (const url of urlVariants(value)) {
      if (!seen.has(url)) {
        seen.add(url);
        candidates.push({ url, endpointId });
      }
    }
  };

  for (const endpoint of endpoints.sort((a, b) => a.priority - b.priority)) add(endpoint.url, endpoint.id);
  add(source.base_url, null);

  const metadataFallbacks = Array.isArray(source.metadata?.fallback_urls)
    ? source.metadata?.fallback_urls.filter((item): item is string => typeof item === "string")
    : [];
  for (const fallback of metadataFallbacks) add(fallback, null);

  return candidates.slice(0, 8);
}

function urlVariants(value: string): string[] {
  const variants: string[] = [];
  try {
    const original = new URL(value);
    original.protocol = "https:";
    original.hash = "";
    variants.push(canonicalize(original));

    const host = original.hostname;
    if (host.startsWith("www.")) {
      const withoutWww = new URL(original);
      withoutWww.hostname = host.slice(4);
      variants.push(canonicalize(withoutWww));
    } else if (!host.endsWith(".gov.ru") && !host.endsWith(".kbr.ru")) {
      const withWww = new URL(original);
      withWww.hostname = `www.${host}`;
      variants.push(canonicalize(withWww));
    }
  } catch {
    return [];
  }
  return [...new Set(variants)];
}

async function fetchOfficial(url: string): Promise<FetchResult> {
  const requestedUrl = url;
  const startedAt = Date.now();
  let currentUrl = url;

  try {
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
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
            pragma: "no-cache",
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
        return {
          ok: false,
          requestedUrl,
          finalUrl: currentUrl,
          status: response.status,
          contentType,
          text: "",
          raw: "",
          latencyMs,
          adapter: "edge-browser-fetch-v059",
          errorType: [401, 403, 429].includes(response.status) ? "access_blocked" : `http_${response.status}`,
          error: `HTTP ${response.status}`,
        };
      }

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_BODY_BYTES) {
        return {
          ok: true,
          requestedUrl,
          finalUrl: response.url || currentUrl,
          status: response.status,
          contentType,
          text: "",
          raw: "",
          latencyMs,
          adapter: "edge-browser-fetch-v059",
          errorType: null,
          error: null,
        };
      }

      const raw = await readLimitedText(response, MAX_BODY_BYTES);
      const textual = isTextual(contentType);
      const text = textual
        ? contentType.includes("html")
          ? htmlToText(raw)
          : normalizeText(raw)
        : "";

      if (textual && text.length < 40) {
        return {
          ok: false,
          requestedUrl,
          finalUrl: response.url || currentUrl,
          status: response.status,
          contentType,
          text,
          raw,
          latencyMs,
          adapter: "edge-browser-fetch-v059",
          errorType: "content_too_short",
          error: "Ответ получен, но полезный текст отсутствует",
        };
      }

      return {
        ok: true,
        requestedUrl,
        finalUrl: response.url || currentUrl,
        status: response.status,
        contentType,
        text,
        raw,
        latencyMs,
        adapter: "edge-browser-fetch-v059",
        errorType: null,
        error: null,
      };
    }
    throw new Error("too_many_redirects");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorType = /abort/i.test(message)
      ? "timeout"
      : /dns|name|resolve/i.test(message)
        ? "dns_error"
        : /certificate|tls|ssl/i.test(message)
          ? "tls_error"
          : /private_network/i.test(message)
            ? "unsafe_redirect"
            : "network_error";
    return {
      ok: false,
      requestedUrl,
      finalUrl: currentUrl,
      status: 0,
      contentType: "",
      text: "",
      raw: "",
      latencyMs: Date.now() - startedAt,
      adapter: "edge-browser-fetch-v059",
      errorType,
      error: message,
    };
  }
}

async function recordHealth(
  source: OfficialSource,
  status: "healthy" | "degraded" | "blocked",
  checkedAt: string,
  attempt: FetchResult | null,
  errorType: string | null,
  error: string | null,
  metadata: Record<string, unknown>,
) {
  const { error: healthError } = await supabase.rpc("gi_record_source_health", {
    p_source_key: source.source_key,
    p_status: status,
    p_error_type: errorType,
    p_last_error: error,
    p_adapter_used: attempt?.adapter ?? "edge-browser-fetch-v059",
    p_checked_at: checkedAt,
    p_metadata: metadata,
  });
  if (healthError) throw healthError;
}

async function recordFailure(
  sourceKey: string,
  message: string,
  checkedAt: string,
  url: string,
  errorType: string,
): Promise<void> {
  await supabase.from("gi_ingestion_failures").insert({
    source_key: sourceKey,
    error_message: `${message} [${url}]`.slice(0, 2000),
    checked_at: checkedAt,
    metadata: { engine: "edge-v0.59", error_type: errorType, url },
  });
}

function discoverUsefulTargets(baseUrl: string, html: string, limit: number): string[] {
  if (!html || limit <= 0) return [];
  const base = new URL(baseUrl);
  const weighted: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    try {
      const candidate = new URL(match[1], base);
      if (candidate.protocol !== "https:" || candidate.hostname !== base.hostname) continue;
      if (/\.(?:jpg|jpeg|png|webp|gif|svg|zip|rar|7z|mp4|mp3)$/i.test(candidate.pathname)) continue;
      const url = canonicalize(candidate);
      if (seen.has(url) || url === canonicalize(base)) continue;
      seen.add(url);
      const label = `${candidate.pathname} ${htmlToText(match[2])}`.toLowerCase();
      const score = /(поддерж|субсид|грант|программ|документ|постанов|приказ|новост|меры|конкурс|закуп|торг|инвест|льгот)/i.test(label)
        ? 10
        : 1;
      weighted.push({ url, score });
    } catch {
      // Ignore malformed links.
    }
  }

  return weighted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.url);
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
    if (remaining <= 0) {
      await reader.cancel();
      break;
    }
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

function isTextual(contentType: string): boolean {
  return contentType.includes("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType === "";
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
    /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1"
  ) {
    throw new Error("private_network_target_rejected");
  }
}

function isDue(source: OfficialSource): boolean {
  if (!source.last_checked_at) return true;
  if (["pending", "degraded", "blocked"].includes(source.status)) return true;
  const checked = new Date(source.last_checked_at).getTime();
  const cadenceMs = Math.max(15, source.cadence_minutes || 1440) * 60_000;
  return Number.isNaN(checked) || checked + cadenceMs <= Date.now();
}

function compareSources(a: OfficialSource, b: OfficialSource): number {
  const statusRank = (status: string) => status === "degraded" || status === "blocked" || status === "pending" ? 0 : 1;
  return statusRank(a.status) - statusRank(b.status) || a.priority - b.priority || a.source_key.localeCompare(b.source_key);
}

function compactAttempt(attempt: FetchResult) {
  return {
    url: attempt.requestedUrl,
    final_url: attempt.finalUrl,
    status: attempt.status,
    latency_ms: attempt.latencyMs,
    error_type: attempt.errorType,
    error: attempt.error,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
