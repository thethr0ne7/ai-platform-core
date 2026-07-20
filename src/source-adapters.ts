import { canonicalizeUrl, type DiscoveredOfficialItem, type SourceAdapter } from "./source-intelligence.js";

export type JurisdictionLevel = "federal" | "regional" | "municipal";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

export interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

export class FetchHttpClient implements HttpClient {
  async get(url: string): Promise<HttpResponse> {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "StateApp-OfficialSourceBot/0.32 (+https://ai-platform-core.vercel.app)",
        accept: "application/json, application/xml, text/xml, text/html, */*",
      },
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: () => response.text(),
      json: async <T>() => response.json() as Promise<T>,
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

interface PravoItem {
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

interface PravoResponse {
  items?: PravoItem[];
  pagesTotalCount?: number;
}

export class PravoApiAdapter implements SourceAdapter {
  readonly sourceId = "pravo-publication";

  constructor(private readonly http: HttpClient = new FetchHttpClient()) {}

  async discover(input: unknown): Promise<DiscoveredOfficialItem[]> {
    const window = normalizeWindow(input);
    const pageSize = [10, 30, 100, 200].includes(window.pageSize ?? 100) ? (window.pageSize ?? 100) : 100;
    const maxPages = Math.max(1, Math.min(window.maxPages ?? 5, 100));
    const found: DiscoveredOfficialItem[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL("https://publication.pravo.gov.ru/api/Documents");
      url.searchParams.set("PageSize", String(pageSize));
      url.searchParams.set("Index", String(page));
      url.searchParams.set("SortedBy", "4");
      url.searchParams.set("SortDestination", "2");
      if (window.from) url.searchParams.set("PublishDateFrom", window.from);
      if (window.to) url.searchParams.set("PublishDateTo", window.to);
      if (window.query) url.searchParams.set("DocumentText", window.query);

      const response = await this.http.get(url.toString());
      if (response.status !== 200) throw new Error(`Pravo API вернул HTTP ${response.status}`);
      const payload = await response.json<PravoResponse>();
      const items = payload.items ?? [];
      for (const item of items) {
        const mapped = mapPravo(item);
        if (mapped) found.push(mapped);
      }
      if (items.length === 0 || page >= (payload.pagesTotalCount ?? page)) break;
    }

    return deduplicate(found);
  }

  async getDocument(eoNumber: string): Promise<Record<string, unknown>> {
    if (!/^\d{19}$/.test(eoNumber)) throw new Error("Некорректный номер электронного опубликования");
    const response = await this.http.get(`https://publication.pravo.gov.ru/api/Document?eoNumber=${eoNumber}`);
    if (response.status !== 200) throw new Error(`Pravo API document вернул HTTP ${response.status}`);
    return response.json<Record<string, unknown>>();
  }
}

export interface GenericOfficialSiteConfig {
  sourceId: string;
  authority: string;
  level: JurisdictionLevel;
  baseUrl: string;
  allowedHosts: string[];
  seedPaths: string[];
  sitemapPaths: string[];
  rssPaths: string[];
  includeUrlPatterns: RegExp[];
  region?: string;
  municipality?: string;
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
    const candidates = new Set<string>();

    for (const path of this.config.sitemapPaths) await this.collectXml(resolve(this.config.baseUrl, path), candidates, "sitemap");
    for (const path of this.config.rssPaths) await this.collectXml(resolve(this.config.baseUrl, path), candidates, "rss");
    for (const path of this.config.seedPaths) {
      const seed = resolve(this.config.baseUrl, path);
      candidates.add(seed);
      await this.collectLinks(seed, candidates);
    }

    const limit = Math.max(1, Math.min((window.pageSize ?? 100) * (window.maxPages ?? 3), 1000));
    const selected = [...candidates]
      .filter((url) => this.isAllowed(url))
      .filter((url) => this.config.includeUrlPatterns.some((pattern) => pattern.test(url)))
      .slice(0, limit);

    const results: DiscoveredOfficialItem[] = [];
    for (const url of selected) {
      const item = await this.inspect(url);
      if (!item) continue;
      if (window.query && !`${item.title} ${item.documentNumber ?? ""}`.toLowerCase().includes(window.query.toLowerCase())) continue;
      if (window.from && item.publishedAt && item.publishedAt < window.from) continue;
      if (window.to && item.publishedAt && item.publishedAt > window.to) continue;
      results.push(item);
    }
    return deduplicate(results);
  }

  private async collectXml(url: string, target: Set<string>, kind: "sitemap" | "rss"): Promise<void> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return;
      const xml = await response.text();
      const pattern = kind === "sitemap" ? /<loc>([\s\S]*?)<\/loc>/gi : /<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/gi;
      for (const match of xml.matchAll(pattern)) {
        const value = decode(match[1] ?? "").trim();
        if (value) target.add(resolve(url, value));
      }
    } catch {
      return;
    }
  }

  private async collectLinks(url: string, target: Set<string>): Promise<void> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return;
      const html = await response.text();
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
        const href = decode(match[1] ?? "").trim();
        if (href && !href.startsWith("javascript:") && !href.startsWith("mailto:")) target.add(resolve(url, href));
      }
    } catch {
      return;
    }
  }

  private async inspect(url: string): Promise<DiscoveredOfficialItem | null> {
    try {
      const response = await this.http.get(url);
      if (response.status !== 200) return null;
      const contentType = response.headers["content-type"] ?? "";
      if (!contentType.includes("text/html")) {
        const title = new URL(url).pathname.split("/").pop() || "Документ";
        return {
          sourceId: this.sourceId,
          canonicalUrl: canonicalizeUrl(url),
          title,
          authority: this.config.authority,
          contentType,
          attachmentUrls: [canonicalizeUrl(url)],
          rawMetadata: metadata(this.config, "direct-file"),
        };
      }

      const html = await response.text();
      const rawTitle = meta(html, "og:title") ?? capture(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ?? capture(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
      if (!rawTitle) return null;
      const title = stripTags(rawTitle);
      const publishedAt = findDate(
        meta(html, "article:published_time")
        ?? metaName(html, "date")
        ?? capture(html, /<time\b[^>]*datetime=["']([^"']+)["']/i)
        ?? capture(html, /(?:Дата публикации|Опубликовано|Размещено)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i),
      );
      const documentNumber = findNumber(`${title} ${stripTags(html).slice(0, 6000)}`);
      const attachments = [...html.matchAll(/<a\b[^>]*href=["']([^"']+\.(?:pdf|docx?|xlsx?|csv|zip))(?:\?[^"']*)?["'][^>]*>/gi)]
        .map((match) => resolve(url, decode(match[1] ?? "")))
        .filter((value) => this.isAllowed(value));

      return {
        sourceId: this.sourceId,
        canonicalUrl: canonicalizeUrl(url),
        title,
        authority: this.config.authority,
        contentType,
        attachmentUrls: [...new Set(attachments.map(canonicalizeUrl))],
        rawMetadata: metadata(this.config, "html-card"),
        ...(publishedAt ? { publishedAt } : {}),
        ...(documentNumber ? { documentNumber } : {}),
      };
    } catch {
      return null;
    }
  }

  private isAllowed(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && this.config.allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }
}

export const REAL_SOURCE_CONFIGS: GenericOfficialSiteConfig[] = [
  {
    sourceId: "government-russia", authority: "Правительство Российской Федерации", level: "federal",
    baseUrl: "https://government.ru/", allowedHosts: ["government.ru", "static.government.ru"],
    seedPaths: ["/docs/", "/news/"], sitemapPaths: ["/sitemap.xml"], rssPaths: ["/rss/"],
    includeUrlPatterns: [/government\.ru\/docs\//i, /static\.government\.ru\/.+\.(pdf|docx?|xlsx?)/i],
  },
  {
    sourceId: "minselkhoz-russia", authority: "Министерство сельского хозяйства Российской Федерации", level: "federal",
    baseUrl: "https://mcx.gov.ru/", allowedHosts: ["mcx.gov.ru"], seedPaths: ["/documents/", "/activity/state-support/"],
    sitemapPaths: ["/sitemap.xml"], rssPaths: [], includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "economy-russia", authority: "Министерство экономического развития Российской Федерации", level: "federal",
    baseUrl: "https://economy.gov.ru/", allowedHosts: ["economy.gov.ru"], seedPaths: ["/material/dokumenty/", "/material/directions/"],
    sitemapPaths: ["/sitemap.xml"], rssPaths: [], includeUrlPatterns: [/\/material\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "kbr-government", authority: "Правительство Кабардино-Балкарской Республики", level: "regional",
    region: "Кабардино-Балкарская Республика", baseUrl: "https://pravitelstvo.kbr.ru/", allowedHosts: ["pravitelstvo.kbr.ru", "kbr.ru"],
    seedPaths: ["/documents/", "/oigv/"], sitemapPaths: ["/sitemap.xml"], rssPaths: [], includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
  {
    sourceId: "nalchik-administration", authority: "Местная администрация городского округа Нальчик", level: "municipal",
    region: "Кабардино-Балкарская Республика", municipality: "городской округ Нальчик", baseUrl: "https://admnalchik.ru/", allowedHosts: ["admnalchik.ru"],
    seedPaths: ["/documents/", "/administration/"], sitemapPaths: ["/sitemap.xml"], rssPaths: [], includeUrlPatterns: [/\/documents\//i, /\.(pdf|docx?|xlsx?)($|\?)/i],
  },
];

export function createRealAdapters(http: HttpClient = new FetchHttpClient()): SourceAdapter[] {
  return [new PravoApiAdapter(http), ...REAL_SOURCE_CONFIGS.map((config) => new GenericOfficialSiteAdapter(config, http))];
}

function mapPravo(item: PravoItem): DiscoveredOfficialItem | null {
  const eoNumber = item.eoNumber?.trim();
  if (!eoNumber) return null;
  const publishedAt = findDate(item.publishDateShort ?? item.viewDate);
  const documentNumber = item.number?.trim();
  return {
    sourceId: "pravo-publication",
    canonicalUrl: `https://publication.pravo.gov.ru/document/${eoNumber}`,
    title: item.complexName?.trim() || item.title?.trim() || item.name?.trim() || `Документ ${eoNumber}`,
    authority: "Официальный интернет-портал правовой информации",
    contentType: "application/pdf",
    attachmentUrls: [`https://publication.pravo.gov.ru/file/image/${eoNumber}`],
    rawMetadata: {
      eoNumber,
      discoveryMethod: "official-api",
      level: "federal",
      id: item.id ?? null,
      documentDate: item.documentDate ?? null,
      signatoryAuthorityId: item.signatoryAuthorityId ?? null,
      documentTypeId: item.documentTypeId ?? null,
      pagesCount: item.pagesCount ?? null,
      pdfFileLength: item.pdfFileLength ?? null,
      zipFileLength: item.zipFileLength ?? null,
    },
    ...(publishedAt ? { publishedAt } : {}),
    ...(documentNumber ? { documentNumber } : {}),
  };
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

function metadata(config: GenericOfficialSiteConfig, discoveryMethod: string): Record<string, unknown> {
  return {
    discoveryMethod,
    level: config.level,
    region: config.region ?? null,
    municipality: config.municipality ?? null,
  };
}

function deduplicate(items: DiscoveredOfficialItem[]): DiscoveredOfficialItem[] {
  const map = new Map<string, DiscoveredOfficialItem>();
  for (const item of items) map.set(canonicalizeUrl(item.canonicalUrl), item);
  return [...map.values()];
}

function resolve(base: string, value: string): string { return new URL(value, base).toString(); }
function decode(value: string): string { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function stripTags(value: string): string { return decode(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function capture(value: string, pattern: RegExp): string | undefined { return value.match(pattern)?.[1]?.trim(); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function meta(html: string, property: string): string | undefined { return capture(html, new RegExp(`<meta\\b[^>]*property=["']${escapeRegex(property)}["'][^>]*content=["']([^"']+)["']`, "i")) ?? capture(html, new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*property=["']${escapeRegex(property)}["']`, "i")); }
function metaName(html: string, name: string): string | undefined { return capture(html, new RegExp(`<meta\\b[^>]*name=["']${escapeRegex(name)}["'][^>]*content=["']([^"']+)["']`, "i")); }
function findDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso?.[1] && iso[2] && iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/);
  if (!ru?.[1] || !ru[2] || !ru[3]) return undefined;
  return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
}
function findNumber(value: string): string | undefined { return value.match(/(?:№|N)\s*([А-ЯA-Z0-9][А-ЯA-Zа-яa-z0-9.\/-]{0,40})/u)?.[1]; }
