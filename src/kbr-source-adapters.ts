import {
  GenericOfficialSiteAdapter,
  type GenericOfficialSiteConfig,
  type HttpClient,
} from "./source-adapters.js";
import type { SourceAdapter } from "./source-intelligence.js";

const KBR_REGION = "Кабардино-Балкарская Республика";

/**
 * Verified official regional domains used by the KBR data pass.
 * Each adapter remains evidence-first: it only accepts HTTPS URLs from its own allowlist.
 */
export const KBR_SOURCE_CONFIGS: readonly GenericOfficialSiteConfig[] = [
  {
    sourceId: "kbr-economy",
    authority: "Министерство экономического развития Кабардино-Балкарской Республики",
    level: "regional",
    region: KBR_REGION,
    baseUrl: "https://economykbr.ru/",
    allowedHosts: ["economykbr.ru"],
    seedPaths: ["/", "/documents/", "/gosudarstvennye-programmy/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: [],
    includeUrlPatterns: [
      /economykbr\.ru\/(documents|gosudarstvennye-programmy|podderzhka|invest)/i,
      /\.(pdf|docx?|xlsx?|csv|zip)($|\?)/i,
    ],
  },
  {
    sourceId: "kbr-tourism-ministry",
    authority: "Министерство курортов и туризма Кабардино-Балкарской Республики",
    level: "regional",
    region: KBR_REGION,
    baseUrl: "https://minturizm.kbr.ru/",
    allowedHosts: ["minturizm.kbr.ru"],
    seedPaths: ["/", "/documents/", "/deyatelnost/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: [],
    includeUrlPatterns: [
      /minturizm\.kbr\.ru\/(documents|deyatelnost|subsid|grant|support)/i,
      /\.(pdf|docx?|xlsx?|csv|zip)($|\?)/i,
    ],
  },
  {
    sourceId: "kbr-land-property",
    authority: "Министерство земельных и имущественных отношений Кабардино-Балкарской Республики",
    level: "regional",
    region: KBR_REGION,
    baseUrl: "https://minimush.kbr.ru/",
    allowedHosts: ["minimush.kbr.ru"],
    seedPaths: ["/", "/documents/", "/gosuslugi/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: [],
    includeUrlPatterns: [
      /minimush\.kbr\.ru\/(documents|gosuslugi|land|property|arenda|imush)/i,
      /\.(pdf|docx?|xlsx?|csv|zip)($|\?)/i,
    ],
  },
  {
    sourceId: "kbr-tourism-portal",
    authority: "Министерство курортов и туризма Кабардино-Балкарской Республики",
    level: "regional",
    region: KBR_REGION,
    baseUrl: "https://visit.kbr.ru/",
    allowedHosts: ["visit.kbr.ru"],
    seedPaths: ["/", "/directions/", "/recovery", "/okbr/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: [],
    includeUrlPatterns: [
      /visit\.kbr\.ru\/(directions|recovery|okbr|news|documents)/i,
      /\.(pdf|docx?|xlsx?|csv|zip)($|\?)/i,
    ],
  },
] as const;

export function createKbrRegionalAdapters(http?: HttpClient): SourceAdapter[] {
  return KBR_SOURCE_CONFIGS.map((config) => new GenericOfficialSiteAdapter(config, http));
}
