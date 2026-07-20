import { createHash } from "node:crypto";

export type SourceKind = "api" | "rss" | "sitemap" | "html" | "document";
export type DocumentFormat = "html" | "pdf" | "docx" | "xlsx" | "csv" | "txt" | "image" | "unknown";
export type ExtractionMethod = "structured" | "html" | "native-document" | "ocr" | "unsupported";
export type SourceLevel = "federal" | "regional" | "municipal" | "development-institution";

export interface OfficialSourceDefinition {
  id: string;
  name: string;
  baseUrl: string;
  level: SourceLevel;
  authority: string;
  region?: string;
  discovery: SourceKind[];
  allowedHosts: string[];
  active: boolean;
}

export interface DiscoveredOfficialItem {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  publishedAt?: string;
  authority?: string;
  documentNumber?: string;
  contentType?: string;
  attachmentUrls: string[];
  rawMetadata: Record<string, unknown>;
}

export interface ExtractionInput {
  url: string;
  contentType?: string;
  fileName?: string;
  bytes?: Uint8Array;
  text?: string;
}

export interface ExtractionDecision {
  format: DocumentFormat;
  method: ExtractionMethod;
  requiresOcr: boolean;
  reason: string;
}

export interface EvidenceRecord {
  sourceId: string;
  canonicalUrl: string;
  authority: string;
  title: string;
  documentNumber?: string;
  publishedAt?: string;
  checkedAt: string;
  contentHash: string;
  extractionMethod: ExtractionMethod;
  text: string;
  citations: EvidenceCitation[];
  metadata: Record<string, unknown>;
}

export interface EvidenceCitation {
  locator: string;
  quote: string;
}

export interface VersionComparison {
  changed: boolean;
  previousHash?: string;
  currentHash: string;
  addedLines: string[];
  removedLines: string[];
}

export interface SourceAdapter {
  readonly sourceId: string;
  discover(input: unknown): Promise<DiscoveredOfficialItem[]>;
}

const MIME_FORMATS: Readonly<Record<string, DocumentFormat>> = {
  "text/html": "html",
  "application/pdf": "pdf",
  "application/msword": "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
};

const EXTENSION_FORMATS: Readonly<Record<string, DocumentFormat>> = {
  html: "html",
  htm: "html",
  pdf: "pdf",
  doc: "docx",
  docx: "docx",
  xls: "xlsx",
  xlsx: "xlsx",
  csv: "csv",
  txt: "txt",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
};

export class OfficialSourceRegistry {
  private readonly sources = new Map<string, OfficialSourceDefinition>();

  register(source: OfficialSourceDefinition): void {
    validateSourceDefinition(source);
    if (this.sources.has(source.id)) throw new Error(`Источник с id ${source.id} уже зарегистрирован`);
    this.sources.set(source.id, structuredClone(source));
  }

  get(id: string): OfficialSourceDefinition {
    const source = this.sources.get(id);
    if (!source) throw new Error(`Официальный источник ${id} не найден`);
    return structuredClone(source);
  }

  listActive(): OfficialSourceDefinition[] {
    return [...this.sources.values()].filter((source) => source.active).map((source) => structuredClone(source));
  }

  assertOfficialUrl(sourceId: string, url: string): URL {
    const source = this.get(sourceId);
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowed = source.allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.toLowerCase();
      return host === normalized || host.endsWith(`.${normalized}`);
    });
    if (!allowed || parsed.protocol !== "https:") throw new Error(`URL не принадлежит разрешённому официальному домену источника ${sourceId}`);
    parsed.hash = "";
    return parsed;
  }
}

export class SourceAdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.sourceId)) throw new Error(`Адаптер для ${adapter.sourceId} уже зарегистрирован`);
    this.adapters.set(adapter.sourceId, adapter);
  }

  get(sourceId: string): SourceAdapter {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) throw new Error(`Адаптер источника ${sourceId} не подключён`);
    return adapter;
  }
}

export function decideExtraction(input: ExtractionInput): ExtractionDecision {
  const format = detectFormat(input);
  switch (format) {
    case "html": return { format, method: "html", requiresOcr: false, reason: "HTML разбирается через DOM без OCR" };
    case "docx":
    case "xlsx":
    case "csv":
    case "txt": return { format, method: "native-document", requiresOcr: false, reason: "Формат имеет машиночитаемую структуру" };
    case "image": return { format, method: "ocr", requiresOcr: true, reason: "Изображение не содержит текстового слоя" };
    case "pdf": {
      const normalized = normalizeText(input.text ?? "");
      return normalized.length >= 80
        ? { format, method: "native-document", requiresOcr: false, reason: "PDF содержит пригодный текстовый слой" }
        : { format, method: "ocr", requiresOcr: true, reason: "В PDF отсутствует пригодный текстовый слой" };
    }
    default: return { format, method: "unsupported", requiresOcr: false, reason: "Формат пока не поддерживается" };
  }
}

export function createEvidenceRecord(args: { source: OfficialSourceDefinition; item: DiscoveredOfficialItem; checkedAt: string; text: string; extractionMethod: ExtractionMethod; citations?: EvidenceCitation[]; }): EvidenceRecord {
  const normalizedText = normalizeText(args.text);
  if (!normalizedText) throw new Error("Нельзя создать доказательство без извлечённого текста");
  if (args.item.sourceId !== args.source.id) throw new Error("Документ не соответствует выбранному источнику");
  return {
    sourceId: args.source.id,
    canonicalUrl: canonicalizeUrl(args.item.canonicalUrl),
    authority: args.item.authority ?? args.source.authority,
    title: args.item.title.trim(),
    ...(args.item.documentNumber ? { documentNumber: args.item.documentNumber.trim() } : {}),
    ...(args.item.publishedAt ? { publishedAt: args.item.publishedAt } : {}),
    checkedAt: args.checkedAt,
    contentHash: sha256(normalizedText),
    extractionMethod: args.extractionMethod,
    text: normalizedText,
    citations: args.citations?.map((citation) => ({ locator: citation.locator.trim(), quote: normalizeText(citation.quote) })) ?? [],
    metadata: structuredClone(args.item.rawMetadata),
  };
}

export function compareEvidenceVersions(previousText: string | undefined, currentText: string): VersionComparison {
  const normalizedCurrent = normalizeText(currentText);
  const currentHash = sha256(normalizedCurrent);
  if (previousText === undefined) return { changed: true, currentHash, addedLines: splitComparableLines(normalizedCurrent), removedLines: [] };
  const normalizedPrevious = normalizeText(previousText);
  const previousHash = sha256(normalizedPrevious);
  if (previousHash === currentHash) return { changed: false, previousHash, currentHash, addedLines: [], removedLines: [] };
  const before = new Set(splitComparableLines(normalizedPrevious));
  const after = new Set(splitComparableLines(normalizedCurrent));
  return { changed: true, previousHash, currentHash, addedLines: [...after].filter((line) => !before.has(line)), removedLines: [...before].filter((line) => !after.has(line)) };
}

export function detectFormat(input: ExtractionInput): DocumentFormat {
  const mime = input.contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime && MIME_FORMATS[mime]) return MIME_FORMATS[mime];
  const name = input.fileName ?? safePathName(input.url);
  const extension = name.toLowerCase().split(".").pop();
  if (extension && EXTENSION_FORMATS[extension]) return EXTENSION_FORMATS[extension];
  return "unknown";
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "yclid", "gclid"].includes(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function validateSourceDefinition(source: OfficialSourceDefinition): void {
  if (!source.id.trim()) throw new Error("У источника отсутствует id");
  if (!source.name.trim()) throw new Error("У источника отсутствует название");
  const base = new URL(source.baseUrl);
  if (base.protocol !== "https:") throw new Error("Официальный источник должен использовать HTTPS");
  if (source.allowedHosts.length === 0) throw new Error("Нужно указать разрешённые официальные домены");
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function splitComparableLines(value: string): string[] { return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0); }
function safePathName(value: string): string { try { return new URL(value).pathname.split("/").pop() ?? ""; } catch { return value; } }
