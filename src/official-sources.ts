import { OfficialSourceRegistry, type OfficialSourceDefinition } from "./source-intelligence.js";

export const INITIAL_OFFICIAL_SOURCES: readonly OfficialSourceDefinition[] = [
  {
    id: "pravo-publication",
    name: "Официальный интернет-портал правовой информации",
    baseUrl: "https://publication.pravo.gov.ru/",
    level: "federal",
    authority: "Российская Федерация",
    discovery: ["html", "sitemap", "document"],
    allowedHosts: ["publication.pravo.gov.ru"],
    active: true,
  },
  {
    id: "government-russia",
    name: "Правительство России",
    baseUrl: "https://government.ru/",
    level: "federal",
    authority: "Правительство Российской Федерации",
    discovery: ["html", "rss", "document"],
    allowedHosts: ["government.ru"],
    active: true,
  },
  {
    id: "minselkhoz-russia",
    name: "Министерство сельского хозяйства России",
    baseUrl: "https://mcx.gov.ru/",
    level: "federal",
    authority: "Министерство сельского хозяйства Российской Федерации",
    discovery: ["html", "document"],
    allowedHosts: ["mcx.gov.ru"],
    active: true,
  },
  {
    id: "economy-russia",
    name: "Министерство экономического развития России",
    baseUrl: "https://economy.gov.ru/",
    level: "federal",
    authority: "Министерство экономического развития Российской Федерации",
    discovery: ["html", "document"],
    allowedHosts: ["economy.gov.ru"],
    active: true,
  },
  {
    id: "kbr-government",
    name: "Правительство Кабардино-Балкарской Республики",
    baseUrl: "https://pravitelstvo.kbr.ru/",
    level: "regional",
    region: "Кабардино-Балкарская Республика",
    authority: "Правительство Кабардино-Балкарской Республики",
    discovery: ["html", "document"],
    allowedHosts: ["pravitelstvo.kbr.ru", "kbr.ru"],
    active: true,
  },
] as const;

export function createInitialOfficialSourceRegistry(): OfficialSourceRegistry {
  const registry = new OfficialSourceRegistry();
  for (const source of INITIAL_OFFICIAL_SOURCES) registry.register(source);
  return registry;
}
