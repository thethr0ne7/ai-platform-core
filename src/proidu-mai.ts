import { createHash } from "node:crypto";
import type { ProductDataRequirement, SourceDefinition, IngestionJob } from "./autonomous-data.js";
import { executeWorkflow, type WorkflowDefinition } from "./workflow.js";
import { InMemoryEvidenceProvider, type EvidenceRecord, type VersionedMemoryRecord } from "./memory.js";
import { InMemoryLexicalRetrievalProvider, type GroundedRetrievalResult } from "./retrieval.js";

export const PROIDU_MAI_REQUIREMENT: ProductDataRequirement = {
  id: "proidu.admission-program.mai-2026",
  productId: "proidu",
  entityType: "admission-program",
  requiredFields: [
    "institution",
    "admissionYear",
    "title",
    "code",
    "exams",
    "city",
    "studyForm",
    "budgetSeats",
    "paidSeats",
    "budgetPassingScore",
    "paidPassingScore",
    "sourceUrl"
  ],
  freshness: { maximumAgeHours: 24, checkIntervalHours: 6 },
  sourcePolicy: { officialOnly: true, allowedDomains: ["priem.mai.ru"], minimumTrust: "official" },
  publicationPolicy: { mode: "automatic", requireEvidence: true, minimumEvidence: 1, requireValidation: true }
};

export const PROIDU_MAI_SOURCE: SourceDefinition = {
  id: "proidu.mai.programs-2026",
  productId: "proidu",
  requirementId: PROIDU_MAI_REQUIREMENT.id,
  entityType: PROIDU_MAI_REQUIREMENT.entityType,
  url: "https://priem.mai.ru/base/programs/",
  trust: "official",
  status: "active",
  checkIntervalHours: 6,
  retryPolicy: { maxAttempts: 3, baseDelaySeconds: 1, maxDelaySeconds: 8 },
  metadata: { institution: "Московский авиационный институт", admissionYear: 2026 }
};

export interface MaiAdmissionProgram {
  institution: "Московский авиационный институт";
  admissionYear: 2026;
  title: string;
  code: string;
  exams: ReadonlyArray<string>;
  city: string;
  studyForm: string;
  budgetSeats: number | null;
  paidSeats: number | null;
  budgetPassingScore: number | null;
  paidPassingScore: number | null;
  sourceUrl: string;
}

export interface QuarantinedMaiRecord {
  title?: string;
  reason: string;
  raw: ReadonlyArray<string>;
}

export interface FetchPolicy {
  timeoutMs: number;
  maxResponseBytes: number;
  maxAttempts: number;
  baseDelayMs: number;
  userAgent: string;
}

export class SourceFetchError extends Error {
  constructor(readonly code: "timeout" | "redirect" | "http" | "content-type" | "too-large" | "network", message: string) {
    super(message);
    this.name = "SourceFetchError";
  }
}

const DEFAULT_FETCH_POLICY: FetchPolicy = {
  timeoutMs: 10_000,
  maxResponseBytes: 2_000_000,
  maxAttempts: 3,
  baseDelayMs: 250,
  userAgent: "PROIDU-DataBot/0.11 (+https://github.com/thethr0ne7/ai-platform-core)"
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchOfficialHtml(
  url: string,
  policy: Partial<FetchPolicy> = {},
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const effective = { ...DEFAULT_FETCH_POLICY, ...policy };
  let lastError: unknown;

  for (let attempt = 1; attempt <= effective.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effective.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { "user-agent": effective.userAgent, accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: controller.signal
      });
      if (response.status >= 300 && response.status < 400) {
        throw new SourceFetchError("redirect", `Redirects are not allowed: HTTP ${response.status}`);
      }
      if (!response.ok) throw new SourceFetchError("http", `Source returned HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("text/html")) {
        throw new SourceFetchError("content-type", `Expected HTML, received ${contentType || "unknown"}`);
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > effective.maxResponseBytes) {
        throw new SourceFetchError("too-large", `Response exceeds ${effective.maxResponseBytes} bytes`);
      }
      const html = await response.text();
      if (Buffer.byteLength(html, "utf8") > effective.maxResponseBytes) {
        throw new SourceFetchError("too-large", `Response exceeds ${effective.maxResponseBytes} bytes`);
      }
      return html;
    } catch (error) {
      lastError = error;
      const permanent = error instanceof SourceFetchError && ["redirect", "content-type", "too-large"].includes(error.code);
      if (permanent || attempt === effective.maxAttempts) break;
      await delay(effective.baseDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof SourceFetchError) throw lastError;
  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new SourceFetchError("timeout", `Source request exceeded ${effective.timeoutMs}ms`);
  }
  throw new SourceFetchError("network", lastError instanceof Error ? lastError.message : "Source request failed");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textLines(fragment: string): string[] {
  return decodeHtml(fragment)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function nullableNumber(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(/[–—]/g, "-");
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pair(value: string): [number | null, number | null] | undefined {
  const match = value.match(/^\s*([\d\s]+|[-–—])\s*\/\s*([\d\s]+|[-–—])\s*$/);
  return match ? [nullableNumber(match[1] ?? ""), nullableNumber(match[2] ?? "")] : undefined;
}

function examNames(raw: string): string[] {
  const map: Record<string, string> = { M: "Математика", "И/Ф": "Информатика или физика", Ф: "Физика", Г: "География", "M/Б": "Математика или биология", "M/И": "Математика или информатика", Р: "Русский язык" };
  const cityIndex = raw.search(/\bМосква\b|\bЖуковский\b|\bСтупино\b/);
  const prefix = cityIndex >= 0 ? raw.slice(0, cityIndex).trim() : raw;
  return prefix.split(/\s+/).map((item) => map[item] ?? item).filter(Boolean);
}

export function parseMaiPrograms(html: string, sourceUrl = PROIDU_MAI_SOURCE.url): {
  records: ReadonlyArray<MaiAdmissionProgram>;
  quarantine: ReadonlyArray<QuarantinedMaiRecord>;
} {
  const headings = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  const records: MaiAdmissionProgram[] = [];
  const quarantine: QuarantinedMaiRecord[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = textLines(heading?.[1] ?? "").join(" ");
    const start = (heading?.index ?? 0) + (heading?.[0].length ?? 0);
    const end = headings[index + 1]?.index ?? html.length;
    const lines = textLines(html.slice(start, end));
    const codeIndex = lines.findIndex((line) => /^\d{2}\.\d{2}\.\d{2}$/.test(line));
    if (codeIndex < 0) continue;
    const code = lines[codeIndex] ?? "";
    const descriptor = lines[codeIndex + 1] ?? "";
    const pairs = lines.slice(codeIndex + 2).map(pair).filter((item): item is [number | null, number | null] => Boolean(item));
    const city = descriptor.match(/Москва|Жуковский|Ступино/)?.[0] ?? "";
    const studyForm = descriptor.match(/Очно-заоч\.?|Заоч\.?|Очная/)?.[0] ?? "";
    const [seats, scores] = pairs;
    const raw = [title, ...lines];

    if (!title || !code || !city || !studyForm || !seats || !scores) {
      quarantine.push({ ...(title ? { title } : {}), reason: "Required MAI admission fields are missing", raw });
      continue;
    }

    records.push({
      institution: "Московский авиационный институт",
      admissionYear: 2026,
      title,
      code,
      exams: examNames(descriptor),
      city,
      studyForm,
      budgetSeats: seats[0],
      paidSeats: seats[1],
      budgetPassingScore: scores[0],
      paidPassingScore: scores[1],
      sourceUrl
    });
  }

  return { records: structuredClone(records), quarantine: structuredClone(quarantine) };
}

export function validateMaiProgram(record: MaiAdmissionProgram): void {
  if (record.institution !== "Московский авиационный институт") throw new Error("Unexpected institution");
  if (record.admissionYear !== 2026) throw new Error("Unexpected admission year");
  if (!record.title.trim()) throw new Error("Program title is required");
  if (!/^\d{2}\.\d{2}\.\d{2}$/.test(record.code)) throw new Error("Program code is invalid");
  if (record.exams.length === 0) throw new Error("At least one exam is required");
  if (!record.city.trim() || !record.studyForm.trim()) throw new Error("City and study form are required");
  if (!record.sourceUrl.startsWith("https://priem.mai.ru/")) throw new Error("Official MAI source URL is required");
}

function canonicalHash(record: MaiAdmissionProgram): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export interface MaiSliceResult {
  job: IngestionJob;
  duplicate: boolean;
  parsedCount: number;
  quarantinedCount: number;
  versions: ReadonlyArray<VersionedMemoryRecord<MaiAdmissionProgram>>;
  searchResults: ReadonlyArray<GroundedRetrievalResult>;
}

interface MaiWorkflowContext extends Record<string, unknown> {
  html: string;
  records: MaiAdmissionProgram[];
  quarantine: QuarantinedMaiRecord[];
  versions: VersionedMemoryRecord<MaiAdmissionProgram>[];
  query: string;
  memory: InMemoryEvidenceProvider;
  retrieval: InMemoryLexicalRetrievalProvider;
  now: Date;
}

export class InMemoryIngestionLedger {
  readonly #completed = new Set<string>();
  has(key: string): boolean { return this.#completed.has(key); }
  complete(key: string): void { this.#completed.add(key); }
}

export async function runMaiVerticalSlice(input: {
  job: IngestionJob;
  html: string;
  query: string;
  now: Date;
  ledger?: InMemoryIngestionLedger;
  memory?: InMemoryEvidenceProvider;
  retrieval?: InMemoryLexicalRetrievalProvider;
}): Promise<MaiSliceResult> {
  const ledger = input.ledger ?? new InMemoryIngestionLedger();
  const memory = input.memory ?? new InMemoryEvidenceProvider("verified-only");
  const retrieval = input.retrieval ?? new InMemoryLexicalRetrievalProvider();
  if (ledger.has(input.job.idempotencyKey)) {
    const searchResults = await retrieval.search({ text: input.query, filters: { namespace: "proidu:mai:2026" } });
    return { job: input.job, duplicate: true, parsedCount: 0, quarantinedCount: 0, versions: [], searchResults };
  }

  const context: MaiWorkflowContext = {
    html: input.html,
    records: [],
    quarantine: [],
    versions: [],
    query: input.query,
    memory,
    retrieval,
    now: input.now
  };

  const workflow: WorkflowDefinition<MaiWorkflowContext> = {
    id: `proidu-mai-${input.job.id}`,
    steps: [
      {
        id: "parse",
        async run(ctx) {
          const parsed = parseMaiPrograms(ctx.html);
          ctx.records = [...parsed.records];
          ctx.quarantine = [...parsed.quarantine];
          if (ctx.records.length === 0) throw new Error("MAI parser produced no valid records");
        }
      },
      {
        id: "validate",
        dependsOn: ["parse"],
        async run(ctx) { for (const record of ctx.records) validateMaiProgram(record); }
      },
      {
        id: "version",
        dependsOn: ["validate"],
        async run(ctx) {
          for (const record of ctx.records) {
            const hash = canonicalHash(record);
            const evidence: EvidenceRecord = {
              id: `mai:${record.code}:${hash.slice(0, 12)}`,
              sourceType: "url",
              sourceRef: record.sourceUrl,
              quote: `${record.title}; ${record.code}; ${record.budgetSeats ?? "-"} / ${record.paidSeats ?? "-"}`,
              status: "verified",
              capturedAt: ctx.now.toISOString(),
              metadata: { contentHash: hash, admissionYear: record.admissionYear }
            };
            const version = await ctx.memory.put<MaiAdmissionProgram>({
              id: `${record.code}:${hash.slice(0, 16)}`,
              namespace: "proidu:mai:2026",
              subject: record.title,
              content: record,
              evidence: [evidence],
              metadata: { contentHash: hash, sourceUrl: record.sourceUrl }
            });
            ctx.versions.push(version);
          }
        }
      },
      {
        id: "index",
        dependsOn: ["version"],
        async run(ctx) {
          for (const version of ctx.versions) {
            const record = version.content;
            ctx.retrieval.add({
              id: version.id,
              namespace: version.namespace,
              content: [record.title, record.code, record.city, record.studyForm, ...record.exams].join(" "),
              source: record.sourceUrl,
              evidence: version.evidence,
              metadata: { admissionYear: record.admissionYear, institution: record.institution }
            });
          }
        }
      }
    ]
  };

  const execution = await executeWorkflow(workflow, context, { concurrency: 2, failurePolicy: "fail-fast" });
  if (execution.status !== "succeeded") {
    const failure = execution.steps.find((step) => step.status === "failed");
    throw new Error(failure?.error ?? "MAI ingestion workflow failed");
  }
  ledger.complete(input.job.idempotencyKey);
  const searchResults = await retrieval.search({ text: input.query, filters: { namespace: "proidu:mai:2026" } });
  return {
    job: input.job,
    duplicate: false,
    parsedCount: context.records.length,
    quarantinedCount: context.quarantine.length,
    versions: structuredClone(context.versions),
    searchResults
  };
}
