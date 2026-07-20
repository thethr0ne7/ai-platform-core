import {
  createEvidenceRecord,
  decideExtraction,
  type DiscoveredOfficialItem,
  type EvidenceRecord,
  type ExtractionMethod,
  type OfficialSourceDefinition,
  type SourceAdapter,
} from "./source-intelligence.js";
import { createInitialOfficialSourceRegistry } from "./official-sources.js";
import { createRealAdapters, type DiscoveryWindow } from "./source-adapters.js";
import { createKbrRegionalAdapters } from "./kbr-source-adapters.js";

export interface ExtractionGateway {
  extract(item: DiscoveredOfficialItem): Promise<{ text: string; method: ExtractionMethod }>;
}

export interface SourcePersistence {
  getLatestText(canonicalUrl: string): Promise<string | undefined>;
  saveEvidence(record: EvidenceRecord): Promise<void>;
  saveDiscoveryFailure(args: { sourceId: string; message: string; checkedAt: string }): Promise<void>;
}

export interface SourceRunResult {
  sourceId: string;
  discovered: number;
  persisted: number;
  skipped: number;
  failed: number;
}

export class SourceIngestionRunner {
  private readonly sources = createInitialOfficialSourceRegistry();

  constructor(
    private readonly adapters: SourceAdapter[],
    private readonly extraction: ExtractionGateway,
    private readonly persistence: SourcePersistence,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(window: DiscoveryWindow = {}): Promise<SourceRunResult[]> {
    const ordered = [...this.adapters].sort(
      (a, b) => sourceRank(this.sources.get(a.sourceId)) - sourceRank(this.sources.get(b.sourceId)),
    );
    const results: SourceRunResult[] = [];

    for (const adapter of ordered) results.push(await this.runAdapter(adapter, window));
    return results;
  }

  private async runAdapter(adapter: SourceAdapter, window: DiscoveryWindow): Promise<SourceRunResult> {
    const source = this.sources.get(adapter.sourceId);
    const checkedAt = this.now().toISOString();
    const result: SourceRunResult = { sourceId: adapter.sourceId, discovered: 0, persisted: 0, skipped: 0, failed: 0 };

    try {
      const items = await adapter.discover(window);
      result.discovered = items.length;
      for (const item of items) {
        try {
          this.sources.assertOfficialUrl(source.id, item.canonicalUrl);
          for (const attachment of item.attachmentUrls) this.sources.assertOfficialUrl(source.id, attachment);
          const extracted = await this.extraction.extract(item);
          if (!extracted.text.trim()) { result.skipped += 1; continue; }
          const previousText = await this.persistence.getLatestText(item.canonicalUrl);
          if (previousText?.trim() === extracted.text.trim()) { result.skipped += 1; continue; }
          await this.persistence.saveEvidence(createEvidenceRecord({
            source,
            item,
            checkedAt,
            text: extracted.text,
            extractionMethod: extracted.method,
          }));
          result.persisted += 1;
        } catch {
          result.failed += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      await this.persistence.saveDiscoveryFailure({
        sourceId: adapter.sourceId,
        checkedAt,
        message: error instanceof Error ? error.message : "Неизвестная ошибка адаптера",
      });
    }
    return result;
  }
}

export class BasicExtractionGateway implements ExtractionGateway {
  async extract(item: DiscoveredOfficialItem): Promise<{ text: string; method: ExtractionMethod }> {
    const target = item.attachmentUrls[0] ?? item.canonicalUrl;
    const response = await fetch(target, { headers: { "user-agent": "StateApp-OfficialSourceBot/0.34" } });
    if (!response.ok) throw new Error(`Не удалось скачать документ: HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? item.contentType ?? "";

    if (contentType.includes("text/html") || contentType.includes("text/plain") || contentType.includes("text/csv")) {
      const raw = await response.text();
      const text = contentType.includes("text/html") ? htmlToText(raw) : raw;
      const decision = decideExtraction({ url: target, contentType, text });
      return { text, method: decision.method };
    }

    const fileName = new URL(target).pathname.split("/").pop();
    const decision = decideExtraction({
      url: target,
      contentType,
      ...(fileName ? { fileName } : {}),
    });
    if (decision.requiresOcr) throw new Error("Документ требует OCR worker; синхронный runner не выполняет OCR внутри основного процесса");
    throw new Error(`Для ${decision.format} требуется подключённый native extraction worker`);
  }
}

export function createDefaultSourceRunner(
  persistence: SourcePersistence,
  extraction: ExtractionGateway = new BasicExtractionGateway(),
): SourceIngestionRunner {
  const adapters = [...createRealAdapters(), ...createKbrRegionalAdapters()];
  const unique = new Map(adapters.map((adapter) => [adapter.sourceId, adapter]));
  return new SourceIngestionRunner([...unique.values()], extraction, persistence);
}

function sourceRank(source: OfficialSourceDefinition): number {
  if (source.level === "federal") return 1;
  if (source.level === "regional") return 2;
  return 3;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
