import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type TriggerPayload = {
  documentId?: string;
  initData?: string;
  max_documents?: number;
  wait?: boolean;
};

type DocumentRow = {
  id: string;
  project_id: string;
  owner_id: string | null;
  telegram_user_id: number | null;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  byte_size: number;
  analysis_status: string;
  analysis_attempts: number;
};

type ParsedPage = {
  pageNumber: number | null;
  locator: string;
  text: string;
};

type ParseResult = {
  parserName: string;
  parserVersion: string;
  pages: ParsedPage[];
};

type ChunkRow = {
  document_id: string;
  project_id: string;
  owner_id: string | null;
  telegram_user_id: number | null;
  ordinal: number;
  page_number: number | null;
  locator: string;
  content: string;
  content_hash: string;
};

type FactCandidate = {
  factCode: string;
  factLabel: string;
  factType: string;
  value: Record<string, unknown>;
  quote: string;
  locator: string;
  confidence: number;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "gi-project-documents";
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const CHUNK_SIZE = 6_000;
const CHUNK_OVERLAP = 300;
const MAX_FACT_CANDIDATES = 60;

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

  const payload = await safeJson<TriggerPayload>(request);
  const scheduler = await isSchedulerRequest(request);
  let telegramUserId: number | null = null;

  if (!scheduler) {
    telegramUserId = await authenticateTelegram(payload.initData);
    if (!telegramUserId) return json({ error: "unauthorized" }, 401);
  }

  const documentId = typeof payload.documentId === "string" ? payload.documentId.trim() : "";
  if (documentId && telegramUserId !== null) {
    const { data: owned, error } = await db
      .from("gi_project_documents")
      .select("id")
      .eq("id", documentId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (error) return json({ error: "ownership_check_failed", detail: error.message }, 500);
    if (!owned) return json({ error: "document_not_found" }, 404);
  }

  const maxDocuments = clamp(payload.max_documents, 1, 8, documentId ? 1 : 4);
  const task = documentId ? processDocument(documentId) : processQueue(maxDocuments);

  if (payload.wait === true && scheduler) {
    const result = await task;
    return json({ accepted: true, background: false, result });
  }

  EdgeRuntime.waitUntil(task.catch((error) => {
    console.error(JSON.stringify({
      event: "project_document_background_failure",
      message: error instanceof Error ? error.message : String(error),
    }));
  }));

  return json({ accepted: true, background: true, documentId: documentId || null, maxDocuments }, 202);
});

async function processQueue(limit: number) {
  const { data, error } = await db
    .from("gi_project_documents")
    .select("id")
    .in("analysis_status", ["uploaded", "queued", "failed"])
    .lt("analysis_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results: unknown[] = [];
  for (const row of data ?? []) {
    results.push(await processDocument(String(row.id)));
  }
  return { processed: results.length, results };
}

async function processDocument(documentId: string) {
  const document = await claimDocument(documentId);
  if (!document) return { documentId, status: "skipped", reason: "not_claimable" };

  try {
    validateMetadata(document);

    const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(document.storage_path);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "storage_download_failed");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== Number(document.byte_size) && Number(document.byte_size) > 0) {
      throw new Error(`byte_size_mismatch:${bytes.byteLength}:${document.byte_size}`);
    }
    if (bytes.byteLength > MAX_BYTES) throw new Error("file_too_large");

    const contentHash = await sha256Bytes(bytes);
    const duplicate = await findParsedDuplicate(document, contentHash);
    if (duplicate) {
      await db.from("gi_project_documents").update({
        analysis_status: "parsed",
        content_hash: contentHash,
        text_hash: duplicate.text_hash,
        parser_name: "duplicate-reuse",
        parser_version: "v0.61",
        page_count: duplicate.page_count,
        char_count: duplicate.char_count,
        chunk_count: 0,
        fact_candidates_count: 0,
        duplicate_of: duplicate.id,
        extracted_data: {
          duplicate_of: duplicate.id,
          reused_parser: duplicate.parser_name,
          reused_text_hash: duplicate.text_hash,
        },
        analysis_finished_at: new Date().toISOString(),
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", document.id);
      return { documentId, status: "parsed", duplicateOf: duplicate.id };
    }

    const parsed = await parseDocument(document, bytes);
    const normalizedPages = parsed.pages
      .map((page) => ({ ...page, text: normalizeText(page.text) }))
      .filter((page) => page.text.length > 0);
    const combinedText = normalizedPages.map((page) => page.text).join("\n\n").slice(0, MAX_TEXT_CHARS);

    if (!combinedText) {
      const imageLike = isImage(document) || isPdf(document);
      await finishWithoutText(document.id, imageLike ? "needs_ocr" : "unsupported", imageLike ? "no_machine_readable_text" : "unsupported_format");
      return { documentId, status: imageLike ? "needs_ocr" : "unsupported" };
    }

    const chunks = await buildChunks(document, normalizedPages);
    const candidates = extractFactCandidates(chunks);
    const textHash = await sha256Text(combinedText);

    await db.from("gi_project_document_chunks").delete().eq("document_id", document.id);
    await db.from("gi_project_fact_candidates").delete().eq("document_id", document.id).eq("status", "pending_confirmation");

    if (chunks.length) {
      const { error } = await db.from("gi_project_document_chunks").insert(chunks);
      if (error) throw error;
    }
    if (candidates.length) {
      const { error } = await db.from("gi_project_fact_candidates").insert(candidates.map((candidate) => ({
        project_id: document.project_id,
        document_id: document.id,
        owner_id: document.owner_id,
        telegram_user_id: document.telegram_user_id,
        fact_code: candidate.factCode,
        fact_label: candidate.factLabel,
        fact_type: candidate.factType,
        value: candidate.value,
        quote: candidate.quote,
        locator: candidate.locator,
        confidence: candidate.confidence,
        status: "pending_confirmation",
      })));
      if (error) throw error;
    }

    const finishedAt = new Date().toISOString();
    const { error: updateError } = await db.from("gi_project_documents").update({
      analysis_status: "parsed",
      content_hash: contentHash,
      text_hash: textHash,
      parser_name: parsed.parserName,
      parser_version: parsed.parserVersion,
      page_count: normalizedPages.length || 1,
      char_count: combinedText.length,
      chunk_count: chunks.length,
      fact_candidates_count: candidates.length,
      duplicate_of: null,
      extracted_data: {
        parser: parsed.parserName,
        parser_version: parsed.parserVersion,
        content_hash: contentHash,
        text_hash: textHash,
        page_count: normalizedPages.length || 1,
        char_count: combinedText.length,
        chunk_count: chunks.length,
        fact_candidates_count: candidates.length,
        preview: combinedText.slice(0, 1_500),
      },
      analysis_finished_at: finishedAt,
      analysis_error: null,
      updated_at: finishedAt,
    }).eq("id", document.id);
    if (updateError) throw updateError;

    return {
      documentId,
      status: "parsed",
      parser: parsed.parserName,
      pages: normalizedPages.length || 1,
      characters: combinedText.length,
      chunks: chunks.length,
      factCandidates: candidates.length,
    };
  } catch (error) {
    const message = sanitizeError(error);
    await db.from("gi_project_documents").update({
      analysis_status: "failed",
      analysis_error: message,
      analysis_finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", document.id);
    return { documentId, status: "failed", error: message };
  }
}

async function claimDocument(documentId: string): Promise<DocumentRow | null> {
  const { data: current, error: readError } = await db
    .from("gi_project_documents")
    .select("id,project_id,owner_id,telegram_user_id,category,file_name,storage_path,mime_type,byte_size,analysis_status,analysis_attempts")
    .eq("id", documentId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current || !["uploaded", "queued", "failed"].includes(String(current.analysis_status))) return null;
  if (Number(current.analysis_attempts ?? 0) >= 3) return null;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("gi_project_documents")
    .update({
      analysis_status: "processing",
      analysis_attempts: Number(current.analysis_attempts ?? 0) + 1,
      analysis_started_at: now,
      analysis_finished_at: null,
      analysis_error: null,
      updated_at: now,
    })
    .eq("id", documentId)
    .eq("analysis_status", current.analysis_status)
    .select("id,project_id,owner_id,telegram_user_id,category,file_name,storage_path,mime_type,byte_size,analysis_status,analysis_attempts")
    .maybeSingle();
  if (error) throw error;
  return data as DocumentRow | null;
}

async function findParsedDuplicate(document: DocumentRow, contentHash: string) {
  const { data, error } = await db
    .from("gi_project_documents")
    .select("id,text_hash,parser_name,page_count,char_count")
    .eq("project_id", document.project_id)
    .eq("content_hash", contentHash)
    .eq("analysis_status", "parsed")
    .neq("id", document.id)
    .order("analysis_finished_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function parseDocument(document: DocumentRow, bytes: Uint8Array): Promise<ParseResult> {
  const extension = extensionOf(document.file_name);
  const mime = (document.mime_type ?? "").toLowerCase();

  if (mime === "application/pdf" || extension === "pdf") return parsePdf(bytes);
  if (mime.includes("wordprocessingml.document") || extension === "docx") return parseDocx(bytes);
  if (mime.startsWith("text/") || ["txt", "csv", "json", "xml", "html", "htm", "md"].includes(extension)) {
    return {
      parserName: "text-decoder",
      parserVersion: "v0.61",
      pages: [{ pageNumber: null, locator: "body", text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) }],
    };
  }

  return { parserName: "unsupported", parserVersion: "v0.61", pages: [] };
}

async function parsePdf(bytes: Uint8Array): Promise<ParseResult> {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("invalid_pdf_signature");
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const rawText = result.text;
  const pages = Array.isArray(rawText) ? rawText : [String(rawText ?? "")];
  return {
    parserName: "unpdf",
    parserVersion: "1.6.2",
    pages: pages.map((text, index) => ({ pageNumber: index + 1, locator: `page:${index + 1}`, text: String(text) })),
  };
}

async function parseDocx(bytes: Uint8Array): Promise<ParseResult> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("invalid_docx_signature");
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const partNames = Object.keys(zip.files)
    .filter((name) => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (!partNames.includes("word/document.xml")) throw new Error("docx_document_xml_missing");
  if (partNames.length > 100) throw new Error("docx_too_many_parts");

  const pages: ParsedPage[] = [];
  for (const name of partNames) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    if (xml.length > 20_000_000) throw new Error("docx_xml_too_large");
    const text = docxXmlToText(xml);
    if (!text) continue;
    pages.push({
      pageNumber: null,
      locator: name === "word/document.xml" ? "document" : name.replace(/^word\//, ""),
      text,
    });
  }

  return { parserName: "jszip-docx", parserVersion: "3.10.1/v0.61", pages };
}

async function buildChunks(document: DocumentRow, pages: ParsedPage[]): Promise<ChunkRow[]> {
  const chunks: ChunkRow[] = [];
  let ordinal = 0;

  for (const page of pages) {
    const pageChunks = splitText(page.text, CHUNK_SIZE, CHUNK_OVERLAP);
    for (let index = 0; index < pageChunks.length; index += 1) {
      const content = pageChunks[index];
      chunks.push({
        document_id: document.id,
        project_id: document.project_id,
        owner_id: document.owner_id,
        telegram_user_id: document.telegram_user_id,
        ordinal,
        page_number: page.pageNumber,
        locator: `${page.locator}${pageChunks.length > 1 ? `:chunk:${index + 1}` : ""}`,
        content,
        content_hash: await sha256Text(content),
      });
      ordinal += 1;
    }
  }

  return chunks;
}

function extractFactCandidates(chunks: ChunkRow[]): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  const seen = new Set<string>();
  const patterns: Array<{
    factCode: string;
    factLabel: string;
    factType: string;
    regex: RegExp;
    confidence: number;
    normalize: (match: RegExpExecArray) => Record<string, unknown>;
  }> = [
    {
      factCode: "organization.inn",
      factLabel: "ИНН",
      factType: "identifier",
      regex: /(?:ИНН\s*[:№]?\s*)(\d{10}|\d{12})/giu,
      confidence: 0.96,
      normalize: (match) => ({ value: match[1] }),
    },
    {
      factCode: "organization.ogrn",
      factLabel: "ОГРН / ОГРНИП",
      factType: "identifier",
      regex: /(?:ОГРН(?:ИП)?\s*[:№]?\s*)(\d{13}|\d{15})/giu,
      confidence: 0.96,
      normalize: (match) => ({ value: match[1] }),
    },
    {
      factCode: "land.cadastral_number",
      factLabel: "Кадастровый номер",
      factType: "identifier",
      regex: /\b(\d{2}:\d{2}:\d{5,8}:\d+)\b/gu,
      confidence: 0.93,
      normalize: (match) => ({ value: match[1] }),
    },
    {
      factCode: "project.amount",
      factLabel: "Денежная сумма",
      factType: "money",
      regex: /\b(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(₽|руб(?:лей|ля|ль|\.)?)/giu,
      confidence: 0.72,
      normalize: (match) => ({ raw: match[0], amount: Number(String(match[1]).replace(/[\s\u00a0]/g, "").replace(",", ".")), currency: "RUB" }),
    },
    {
      factCode: "project.percentage",
      factLabel: "Процент",
      factType: "percentage",
      regex: /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*%/gu,
      confidence: 0.68,
      normalize: (match) => ({ raw: match[0], value: Number(String(match[1]).replace(",", ".")) }),
    },
    {
      factCode: "land.area",
      factLabel: "Площадь участка",
      factType: "area",
      regex: /\b(\d+(?:[.,]\d+)?)\s*(га|гектар(?:а|ов)?|м²|кв\.?\s*м)\b/giu,
      confidence: 0.78,
      normalize: (match) => ({ raw: match[0], value: Number(String(match[1]).replace(",", ".")), unit: String(match[2]).toLowerCase() }),
    },
    {
      factCode: "project.date",
      factLabel: "Дата",
      factType: "date",
      regex: /\b([0-3]?\d[./-][01]?\d[./-](?:19|20)\d{2})\b/gu,
      confidence: 0.62,
      normalize: (match) => ({ raw: match[1] }),
    },
  ];

  for (const chunk of chunks) {
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(chunk.content)) && candidates.length < MAX_FACT_CANDIDATES) {
        const key = `${pattern.factCode}:${match[0].toLowerCase().replace(/\s+/g, "")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          factCode: pattern.factCode,
          factLabel: pattern.factLabel,
          factType: pattern.factType,
          value: pattern.normalize(match),
          quote: surroundingQuote(chunk.content, match.index, match[0].length),
          locator: chunk.locator,
          confidence: pattern.confidence,
        });
      }
    }
    if (candidates.length >= MAX_FACT_CANDIDATES) break;
  }
  return candidates;
}

async function finishWithoutText(documentId: string, status: "needs_ocr" | "unsupported", reason: string) {
  const now = new Date().toISOString();
  const { error } = await db.from("gi_project_documents").update({
    analysis_status: status,
    parser_name: status === "needs_ocr" ? "ocr-required" : "unsupported",
    parser_version: "v0.61",
    page_count: 0,
    char_count: 0,
    chunk_count: 0,
    fact_candidates_count: 0,
    extracted_data: { reason },
    analysis_error: reason,
    analysis_finished_at: now,
    updated_at: now,
  }).eq("id", documentId);
  if (error) throw error;
}

function validateMetadata(document: DocumentRow) {
  if (!document.storage_path || !document.file_name) throw new Error("document_metadata_incomplete");
  if (Number(document.byte_size) <= 0) throw new Error("empty_file");
  if (Number(document.byte_size) > MAX_BYTES) throw new Error("file_too_large");
  const extension = extensionOf(document.file_name);
  const allowed = new Set(["pdf", "docx", "txt", "csv", "json", "xml", "html", "htm", "md", "jpg", "jpeg", "png", "webp"]);
  if (!allowed.has(extension)) throw new Error(`unsupported_extension:${extension || "none"}`);
}

function isPdf(document: DocumentRow) {
  return document.mime_type?.toLowerCase() === "application/pdf" || extensionOf(document.file_name) === "pdf";
}

function isImage(document: DocumentRow) {
  return document.mime_type?.toLowerCase().startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extensionOf(document.file_name));
}

function docxXmlToText(xml: string): string {
  return normalizeText(decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/>/gi, "\t")
      .replace(/<w:br\s*\/?\s*>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t")
      .replace(/<[^>]+>/g, " "),
  ));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return text ? [text] : [];
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(size * 0.55)) end = boundary + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) result.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result;
}

function surroundingQuote(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + length + 140);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500);
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

async function authenticateTelegram(initData: unknown): Promise<number | null> {
  if (typeof initData !== "string" || !initData) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-project-api`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SERVICE_ROLE_KEY },
      body: JSON.stringify({ action: "authenticate", initData }),
    });
    const payload = await response.json();
    return response.ok && payload?.user?.id ? Number(payload.user.id) : null;
  } catch {
    return null;
  }
}

async function isSchedulerRequest(request: Request): Promise<boolean> {
  const token = request.headers.get("x-scheduler-token")?.trim();
  if (!token) return false;
  const { data, error } = await db.rpc("gi_verify_scheduler_token", { p_token_hash: await sha256Text(token) });
  return !error && data === true;
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return toHex(new Uint8Array(digest));
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 1_000);
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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
