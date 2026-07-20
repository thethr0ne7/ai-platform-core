import { canonicalizeUrl, type DiscoveredOfficialItem, type SourceAdapter } from "./source-intelligence.js";

export type JurisdictionLevel = "federal" | "regional" | "municipal";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

export interface HttpClient {
  get(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<HttpResponse>;
}

export class FetchHttpClient implements HttpClient {
  async get(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<HttpResponse> {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "StateApp-OfficialSourceBot/0.32 (+https://ai-platform-core.vercel.app)",
        accept: "application/json, application/xml, text/xml, text/html, */*",
        ...init?.headers,
      },
      ...(init?.signal ? { signal: init.signal } : {}),
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: () => response.text(),
      json: <T>() => response.json() as Promise<T>,
    };
  }
}

export interface DiscoveryWindow {
  from?: string;
  to?: string;
  pageSize?: number;
  maxPages?: number;
  query?: string;
}

interface PravoDocumentItem {
  id?: string;
  eoNumber?: string;
  publishDateShort?: string;
  viewDate?: string;
  complexName?: string;
  title?: string;
  name?: string;
  number?: string;
  documentDate?: string;
  signatoryAuthorityId?: string;
  documentTypeId?: string;
  pagesCount?: number;
  pdfFileLength?: number;
  zipFileLength?: number;
}

interface PravoDocumentsResponse {
  items?: PravoDocumentItem[];
  currentPage?: number;
  pagesTotalCount?: number;
  itemsTotalCount?: number;
}

export class PravoApiAdapter implements SourceAdapter {
  readonly sourceId = "pravo-publication";
  private readonly apiBase = "https://publication.pravo.gov.ru/api";

  constructor(private readonly http: HttpClient = new FetchHttpClient()) {}

  async discover(input: unknown): Promise<DiscoveredOfficialItem[]> {
    const window = normalizeWindow(input);
    const pageSize = allowedPageSize(window.pageSize ?? 100);
    const maxPages = Math.max(1, Math.min(window.maxPages ?? 5, 100));
    const results: DiscoveredOfficialItem[] = [];

    for (let index = 1; index <= maxPages; index += 1) {
      const url = new URL(`${this.apiBase}/Documents`);
      url.searchParams.set("PageSize", String(pageSize));
      url.searchParams.set("Index", String(index));
      url.searchParams.set("SortedBy", "4");
      url.searchParams.set("SortDestination", "2");
      if (window.from) url.searchParams.set("PublishDateFrom", window.from);
      if (window.to) url.searchParams.set("PublishDateTo", window.to);
      if (window.query) url.searchParams.set("DocumentText", window.query);

      const response = await this.http.get(url.toString());
      if (response.status !== 200) throw new Error(`Pravo API вернул HTTP ${response.status}`);
      const payload = await response.json<PravoDocumentsResponse>();
      const items = payload.items ?? [];
      results.push(...items.flatMap((item) => mapPravoItem(item)));
      if (items.length === 0 || index >= (payload.pagesTotalCount ?? index)) break;
    }

    return deduplicate(results);
  }

  async getDocument(eoNumber: string): Promise<Record<string, unknown>> {
    if (!/^\d{19}$/.test(eoNumber)) throw new Error("Некорректный номер электронного опубликования");
    const url = `${this.apiBase}/Document?eoNumber=${encodeURIComponent(eoNumber)}`;
    const response = await this.http.get(url);
    if (response.status !== 200) throw new Error(`Pravo API document вернул HTTP ${response.status}`);
    return response.json<Record<string, unknown>>();
  }
}

export interface GenericOfficialSiteConfig {
  sourceId: string;
  authority: string;
  level: JurisdictionLevel;
  region?: string;
  municipality?: string;
  baseUrl: string;
  allowedHosts: string[];
  seedPaths: string[];
  sitemapPaths?: string[];
  rssPaths?: string[];
  includeUrlPatterns?: RegExp[];
  excludeUrlPatterns?: RegExp[];
}

export class GenericOfficialSiteAdapter implements SourceAdapter {
  readonly sourceId: string;

  constructor(
    private readonly config: GenericOfficialSiteConfig,
    private readonly http: HttpClient = new FetchHttpClient(),
  ) {
    this.sourceId = config.sourceId;
  }

  async discover(input: unknown): Promise<DiscoveredOfficialItem[]> {
    const window = normalizeWindow(input);
    const candidateUrls = new Set<string>();

    for (const path of this.config.sitemapPaths ?? ["/sitemap.xml", "/sitemap_index.xml"]) {
      await this.collectFeedUrls(resolve(this.config.baseUrl, path), candidateUrls, "sitemap");
    }
    for (const path of this.config.rssPaths ?? ["/rss/", "/rss.xml", "/feed/"]) {
      await this.collectFeedUrls(resolve(this.config.baseUrl, path), candidateUrls, "rss");
    }
    for (const path of this.config.seedPaths) {
      const url = resolve(this.config.baseUrl, path);
      candidateUrls.add(url);
      await this.collectHtmlLinks(url, candidateUrls);
    }

    const selected = [...candidateUrls]
      .filter((url) => this.isAllowed(url))
      .filter((url) => this.matchesRules(url))
      .slice(0, Math.max(1, Math.min((window.pageSize ?? 100) * (window.maxPages ?? 3), 1000)));

    const items: DiscoveredOfficialItem[] = [];
    for (const url of selected) {
      const item = await this.inspectPage(url);
      if (!item) continue;
      if (window.query && !`${item.title} ${item.documentNumber ?? ""}`.toLowerCase().includes(window.query.toLowerCase())) continue;
      if (window.from && item.publishedAt && item.publishedAt < window.from) continue;
      if (window.to && item.publishedAt && item.publishedAt > window.to) continue;
      items.push(item);
    }
    return deduplicate(items);
  }

  private async collectFeedUrls(url: string, target: Set<string>, kind: "sitemap" | "rss"): Promise<void> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return;
      const xml = await response.text();
      const matches = kind === "sitemap"
        ? [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
        : [...xml.matchAll(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/gi)];
      for (const match of matches) {
        const value = decodeXml(match[1] ?? "").trim();
        if (value) target.add(resolve(url, value));
      }
    } catch {
      // A missing feed must not stop the remaining discovery channels.
    }
  }

  private async collectHtmlLinks(url: string, target: Set<string>): Promise<void> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return;
      const html = await response.text();
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
        const href = decodeHtml(match[1] ?? "").trim();
        if (href && !href.startsWith("javascript:") && !href.startsWith("mailto:")) target.add(resolve(url, href));
      }
    } catch {
      // One failed seed page must not abort the source scan.
    }
  }

  private async inspectPage(url: string): Promise<DiscoveredOfficialItem | null> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return null;
      const contentType = response.headers["content-type"] ?? "";
      if (!contentType.includes("text/html")) {
        const fileName = new URL(url).pathname.split("/").pop() ?? "Документ";
        return {
          sourceId: this.sourceId,
          canonicalUrl: canonicalizeUrl(url),
          title: fileName,
          authority: this.config.authority,
          contentType,
          attachmentUrls: [canonicalizeUrl(url)],
          rawMetadata: this.baseMetadata("direct-file"),
        };
      }

      const html = await response.text();
      const title = firstNonEmpty(
        meta(html, "og:title"),
        capture(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
        capture(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
      );
      if (!title) return null;
      const cleanTitle = stripTags(title);
      const publishedAt = findIsoDate(firstNonEmpty(
        meta(html, "article:published_time"),
        metaName(html, "date"),
        capture(html, /<time\b[^>]*datetime=["']([^"']+)["']/i),
        capture(html, /(?:Дата публикации|Опубликовано|Размещено)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i),
      ));
      const documentNumber = findDocumentNumber(`${cleanTitle} ${stripTags(html).slice(0, 6000)}`);
      const attachments = [...html.matchAll(/<a\b[^>]*href=["']([^"']+\.(?:pdf|docx?|xlsx?|csv|zip))(?:\?[^"']*)?["'][^>]*>/gi)]
        .map((match) => resolve(url, decodeHtml(match[1] ?? "")))
        .filter((value) => this.isAllowed(value));

      return {
        sourceId: this.sourceId,
        canonicalUrl: canonicalizeUrl(url),
        title: cleanTitle,
        ...(publishedAt ? { publishedAt } : {}),
        authority: this.config.authority,
        ...(documentNumber ? { documentNumber } : {}),
        contentType,
        attachmentUrls: [...new Set(attachments.map(canonicalizeUrl))],
        rawMetadata: this.baseMetadata("html-card"),
      };
    } catch {
      return null;
    }
  }

  private baseMetadata(discoveryMethod: string): Record<string, unknown> {
    return {
      discoveryMethod,
      level: this.config.level,
      ...(this.config.region ? { region: this.config.region } : {}),
      ...(this.config.municipality ? { municipality: this.config.municipality } : {}),
    };
  }

  private isAllowed(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && this.config.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  private matchesRules(url: string): boolean {
    if (this.config.excludeUrlPatterns?.some((pattern) => pattern.test(url))) return false;
    if (!this.config.includeUrlPatterns?.length) return true;
    return this.config.includeUrlPatterns.some((pattern) => pattern.test(url));
  }
}

export const REAL_SOURCE_CONFIGS: readonly GenericOfficialSiteConfig[] = [
  {
    sourceId: "government-russia",
    authority: "Правительство Российской Федерации",
    level: "federal",
    baseUrl: "https://government.ru/",
    allowedHosts: ["government.ru", "static.government.ru"],
    seedPaths: ["/docs/", "/news/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: ["/rss/"],
    includeUrlPatterns: [/government\.ru\/docs\//i, /static\.government\.ru\/.+\.(pdf|docx?|xlsx?)/i],
  },
  {
    sourceId: "minselkhoz-russia",
    authority: "Министерство сельского хозяйства Российской Федерации",
    level: "federal",
    baseUrl: "https://mcx.gov.ru/",
    allowedHosts: ["mcx.gov.ru"],
    seedPaths: ["/documents/", "/activity/state-support/"],
    includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "economy-russia",
    authority: "Министерство экономического развития Российской Федерации",
    level: "federal",
    baseUrl: "https://economy.gov.ru/",
    allowedHosts: ["economy.gov.ru"],
    seedPaths: ["/material/dokumenty/", "/material/directions/"],
    includeUrlPatterns: [/\/material\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "kbr-government",
    authority: "Правительство Кабардино-Балкарской Республики",
    level: "regional",
    region: "Кабардино-Балкарская Республика",
    baseUrl: "https://pravitelstvo.kbr.ru/",
    allowedHosts: ["pravitelstvo.kbr.ru", "kbr.ru"],
    seedPaths: ["/documents/", "/oigv/"],
    includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "nalchik-administration",
    authority: "Местная администрация городского округа Нальчик",
    level: "municipal",
    region: "Кабардино-Балкарская Республика",
    municipality: "городской округ Нальчик",
    baseUrl: "https://admnalchik.ru/",
    allowedHosts: ["admnalchik.ru"],
    seedPaths: ["/documents/", "/administration/"],
    includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
] as const;

export function createRealAdapters(http: HttpClient = new FetchHttpClient()): SourceAdapter[] {
  return [new PravoApiAdapter(http), ...REAL_SOURCE_CONFIGS.map((config) => new GenericOfficialSiteAdapter(config, http))];
}

function mapPravoItem(item: PravoDocumentItem): DiscoveredOfficialItem[] {
  const eoNumber = item.eoNumber?.trim();
  if (!eoNumber) return [];
  const canonicalUrl = `https://publication.pravo.gov.ru/document/${eoNumber}`;
  const pdfUrl = `https://publication.pravo.gov.ru/file/image/${eoNumber}`;
  return [{
    sourceId: "pravo-publication",
    canonicalUrl,
    title: item.complexName?.trim() || item.title?.trim() || item.name?.trim() || `Документ ${eoNumber}`,
    ...(normalizeDate(item.publishDateShort ?? item.viewDate) ? { publishedAt: normalizeDate(item.publishDateShort ?? item.viewDate) } : {}),
    authority: "Официальный интернет-портал правовой информации",
    ...(item.number?.trim() ? { documentNumber: item.number.trim() } : {}),
    contentType: "application/pdf",
    attachmentUrls: [pdfUrl],
    rawMetadata: {
      id: item.id,
      eoNumber,
      documentDate: item.documentDate,
      signatoryAuthorityId: item.signatoryAuthorityId,
      documentTypeId: item.documentTypeId,
      pagesCount: item.pagesCount,
      pdfFileLength: item.pdfFileLength,
      zipFileLength: item.zipFileLength,
      discoveryMethod: "official-api",
      level: "federal",
    },
  }];
}

function normalizeWindow(input: unknown): DiscoveryWindow {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  return {
    ...(typeof value.from === "string" ? { from: value.from } : {}),
    ...(typeof value.to === "string" ? { to: value.to } : {}),
    ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
    ...(typeof value.maxPages === "number" ? { maxPages: value.maxPages } : {}),
    ...(typeof value.query === "string" ? { query: value.query } : {}),
  };
}

function allowedPageSize(value: number): number {
  return [10, 30, 100, 200].includes(value) ? value : 100;
}

function deduplicate(items: DiscoveredOfficialItem[]): DiscoveredOfficialItem[] {
  const map = new Map<string, DiscoveredOfficialItem>();
  for (const item of items) map.set(canonicalizeUrl(item.canonicalUrl), item);
  return [...map.values()];
}

function resolve(base: string, value: string): string {
  return new URL(value, base).toString();
}

function decodeXml(value: string): string {
  return decodeHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function capture(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1]?.trim();
}

function meta(html: string, property: string): string | undefined {
  return capture(html, new RegExp(`<meta\\b[^>]*property=["']${escapeRegex(property)}["'][^>]*content=["']([^"']+)["']`, "i"))
    ?? capture(html, new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*property=["']${escapeRegex(property)}["']`, "i"));
}

function metaName(html: string, name: string): string | undefined {
  return capture(html, new RegExp(`<meta\\b[^>]*name=["']${escapeRegex(name)}["'][^>]*content=["']([^"']+)["']`, "i"));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim());
}

function findIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/);
  if (!ru) return undefined;
  return `${ru[3]}-${String(ru[2]).padStart(2, "0")}-${String(ru[1]).padStart(2, "0")}`;
}

function normalizeDate(value: string | undefined): string | undefined {
  return findIsoDate(value);
}

function findDocumentNumber(value: string): string | undefined {
  return value.match(/(?:№|N)\s*([А-ЯA-Z0-9][А-ЯA-Zа-яa-z0-9.\/-]{0,40})/u)?.[1];
}
