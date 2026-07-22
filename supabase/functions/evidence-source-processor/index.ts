import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { extractText, getDocumentProxy } from "unpdf";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type Payload = { max_tasks?: number; wait?: boolean };
type QueueTask = {
  id: string;
  task_type: string;
  target_url: string | null;
  source_document_id: string | null;
  status: string;
  gi_source_documents: {
    id: string;
    source_key: string;
    canonical_url: string;
    title: string;
    authority: string | null;
    document_number: string | null;
    published_at: string | null;
    evidence_tier: string;
  } | null;
};
type FetchResponse = {
  ok: boolean;
  status: number;
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  bodyBase64?: string;
  truncated?: boolean;
  acquisition?: "direct" | "vercel_relay";
  error?: string;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const RELAY_URL = "https://ai-platform-core.vercel.app/api/source-relay";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile Safari/604.1 EvidenceFoundation/0.66";
const MAX_BYTES = 2_500_000;
const MAX_TEXT = 3_000_000;
const MAX_PAGES = 180;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,x-scheduler-token",
        "access-control-allow-methods": "POST,OPTIONS",
      },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = request.headers.get("x-scheduler-token")?.trim() ?? "";
  if (!token || !(await verifySchedulerToken(token))) return json({ error: "unauthorized" }, 401);

  const payload = await safeJson<Payload>(request);
  const maxTasks = clamp(payload.max_tasks, 1, 8, 3);
  const work = processQueue(token, maxTasks);

  if (payload.wait === true) return json({ accepted: true, background: false, result: await work });

  EdgeRuntime.waitUntil(work.catch((error) => {
    console.error(JSON.stringify({
      event: "evidence_source_background_failure",
      error: error instanceof Error ? error.message : String(error),
    }));
  }));
  return json({ accepted: true, background: true, maxTasks }, 202);
});

async function processQueue(token: string, limit: number) {
  const { data, error } = await db
    .from("gi_evidence_verification_queue")
    .select("id,task_type,target_url,source_document_id,status,gi_source_documents(id,source_key,canonical_url,title,authority,document_number,published_at,evidence_tier)")
    .in("status", ["pending", "blocked"])
    .in("task_type", ["source_link", "edition_check"])
    .not("source_document_id", "is", null)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results: unknown[] = [];
  for (const row of (data ?? []) as unknown as QueueTask[]) {
    results.push(await processTask(token, row));
  }
  return { processed: results.length, results };
}

async function processTask(token: string, task: QueueTask) {
  const document = task.gi_source_documents;
  if (!document || !task.target_url) return { taskId: task.id, status: "skipped", reason: "missing_source_document" };

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("gi_evidence_verification_queue")
    .update({ status: "in_progress", updated_at: claimedAt })
    .eq("id", task.id)
    .in("status", ["pending", "blocked"])
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { taskId: task.id, status: "skipped", reason: "already_claimed" };

  try {
    const landing = await fetchSource(token, task.target_url);
    if (!landing.ok || !landing.bodyBase64) throw new Error(landing.error ?? `source_http_${landing.status}`);

    let bytes = decodeBase64(landing.bodyBase64);
    let contentType = landing.contentType.toLowerCase();
    let extractionUrl = landing.finalUrl;
    let acquisition = landing.acquisition ?? "direct";
    let pages: Array<{ locator: string; text: string }> = [];
    let extractionMethod = "evidence-html-v066";

    if (contentType.includes("pdf") || hasPdfSignature(bytes)) {
      pages = await parsePdf(bytes);
      extractionMethod = "evidence-unpdf-v066";
    } else {
      const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const pdfUrl = discoverPdfUrl(landing.finalUrl, html);
      if (pdfUrl) {
        const pdf = await fetchSource(token, pdfUrl);
        if (pdf.ok && pdf.bodyBase64) {
          bytes = decodeBase64(pdf.bodyBase64);
          contentType = pdf.contentType.toLowerCase();
          extractionUrl = pdf.finalUrl;
          acquisition = pdf.acquisition ?? acquisition;
          if (contentType.includes("pdf") || hasPdfSignature(bytes)) {
            pages = await parsePdf(bytes);
            extractionMethod = "evidence-unpdf-v066";
          }
        }
      }
      if (!pages.length) {
        const text = htmlToText(html).slice(0, MAX_TEXT);
        if (text.length < 80) throw new Error("source_text_too_short");
        pages = [{ locator: "body", text }];
      }
    }

    const normalizedPages = pages
      .slice(0, MAX_PAGES)
      .map((page) => ({ ...page, text: normalizeText(page.text) }))
      .filter((page) => page.text.length >= 20);
    const combinedText = normalizedPages.map((page) => page.text).join("\n\n").slice(0, MAX_TEXT);
    if (!combinedText) throw new Error("no_machine_readable_text");

    const contentHash = await sha256Text(combinedText);
    const citations = normalizedPages.slice(0, 80).map((page) => ({
      locator: page.locator,
      quote: page.text.slice(0, 700),
    }));

    const { data: persisted, error: persistError } = await db.rpc("gi_persist_source_evidence", {
      p_record: {
        source_id: document.source_key,
        canonical_url: document.canonical_url,
        title: document.title,
        authority: document.authority,
        document_number: document.document_number,
        published_at: document.published_at,
        checked_at: new Date().toISOString(),
        content_hash: contentHash,
        extracted_text: combinedText,
        extraction_method: extractionMethod,
        citations,
        metadata: {
          evidence_capture_engine: "evidence-source-processor-v0.66",
          evidence_tier: document.evidence_tier,
          canonical_official_url: document.canonical_url,
          acquisition_url: task.target_url,
          landing_url: landing.finalUrl,
          extraction_url: extractionUrl,
          acquisition,
          content_type: contentType,
          pages: normalizedPages.length,
          characters: combinedText.length,
          truncated: landing.truncated === true,
          human_verification_required: true,
        },
      },
    });
    if (persistError) throw persistError;

    const finishedAt = new Date().toISOString();
    await db.from("gi_evidence_verification_queue").update({
      status: "in_progress",
      result: {
        capture_status: "captured",
        document_id: persisted?.document_id ?? document.id,
        version_id: persisted?.version_id ?? null,
        content_hash: contentHash,
        pages: normalizedPages.length,
        characters: combinedText.length,
        extraction_method: extractionMethod,
        extraction_url: extractionUrl,
        acquisition,
        human_verification_required: true,
      },
      notes: "Официальный текст сохранён. Автоматическая фиксация не подтверждает юридические требования: требуется проверка цитат и локаторов.",
      updated_at: finishedAt,
    }).eq("id", task.id);

    return {
      taskId: task.id,
      status: "captured",
      documentId: persisted?.document_id ?? document.id,
      versionId: persisted?.version_id ?? null,
      pages: normalizedPages.length,
      characters: combinedText.length,
      extractionMethod,
      acquisition,
    };
  } catch (error) {
    const message = sanitizeError(error);
    await db.from("gi_evidence_verification_queue").update({
      status: "blocked",
      notes: message,
      result: { capture_status: "failed", error: message },
      updated_at: new Date().toISOString(),
    }).eq("id", task.id);
    return { taskId: task.id, status: "blocked", error: message };
  }
}

async function fetchSource(token: string, url: string): Promise<FetchResponse> {
  const direct = await directFetch(url);
  if (direct.ok && direct.bodyBase64) return direct;

  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-source-relay-token": token,
      },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json() as FetchResponse;
    payload.acquisition = "vercel_relay";
    if (!response.ok && !payload.error) payload.error = `relay_http_${response.status}`;
    return payload;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      requestedUrl: url,
      finalUrl: url,
      contentType: "",
      acquisition: "vercel_relay",
      error: `direct:${direct.error ?? "failed"}; relay:${sanitizeError(error)}`,
    };
  }
}

async function directFetch(url: string): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.5",
        "cache-control": "no-cache",
      },
    });
    const bytes = await readLimited(response, MAX_BYTES);
    return {
      ok: response.ok,
      status: response.status,
      requestedUrl: url,
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") ?? "",
      bodyBase64: encodeBase64(bytes),
      truncated: bytes.byteLength >= MAX_BYTES,
      acquisition: "direct",
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      requestedUrl: url,
      finalUrl: url,
      contentType: "",
      acquisition: "direct",
      error: sanitizeError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
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
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function parsePdf(bytes: Uint8Array) {
  if (!hasPdfSignature(bytes)) throw new Error("invalid_pdf_signature");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const raw = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
  return raw.map((text, index) => ({ locator: `page:${index + 1}`, text: String(text) }));
}

function discoverPdfUrl(baseUrl: string, html: string): string | null {
  const candidates = [
    ...html.matchAll(/href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi),
    ...html.matchAll(/["'](?:fileUrl|downloadUrl|pdfUrl)["']\s*:\s*["']([^"']+)["']/gi),
  ];
  for (const match of candidates) {
    try {
      const value = decodeHtml(match[1].replace(/\\\//g, "/"));
      const url = new URL(value, baseUrl);
      if (url.protocol === "https:" && (url.pathname.toLowerCase().endsWith(".pdf") || /pdf/i.test(url.search))) {
        return url.toString();
      }
    } catch {
      // Ignore malformed document links.
    }
  }
  return null;
}

function htmlToText(html: string) {
  return normalizeText(decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  ));
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function verifySchedulerToken(token: string) {
  const { data, error } = await db.rpc("gi_verify_scheduler_token", { p_token_hash: await sha256Text(token) });
  return !error && data === true;
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 1000);
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function safeJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
