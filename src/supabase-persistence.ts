import type { IngestionJob, SourceStatus } from "./autonomous-data.js";
import type { EvidenceRecord, VersionedMemoryRecord } from "./memory.js";
import {
  InMemoryIngestionLedger,
  type MaiAdmissionProgram,
  type MaiSliceResult,
  runMaiVerticalSlice
} from "./proidu-mai.js";
import { InMemoryEvidenceProvider } from "./memory.js";
import { InMemoryLexicalRetrievalProvider } from "./retrieval.js";

export interface SupabasePersistenceConfig {
  url: string;
  serviceRoleKey: string;
  schema?: string;
}

export class SupabasePersistenceError extends Error {
  constructor(readonly status: number, readonly operation: string, message: string) {
    super(`${operation}: ${message}`);
    this.name = "SupabasePersistenceError";
  }
}

function normalizeConfig(input: SupabasePersistenceConfig): Required<SupabasePersistenceConfig> {
  const url = input.url.trim().replace(/\/$/, "");
  const serviceRoleKey = input.serviceRoleKey.trim();
  const schema = input.schema?.trim() || "public";
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  if (!serviceRoleKey) throw new Error("Supabase service role key is required");
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Supabase schema is invalid");
  return { url, serviceRoleKey, schema };
}

export class SupabasePostgrestClient {
  readonly config: Required<SupabasePersistenceConfig>;

  constructor(
    config: SupabasePersistenceConfig,
    readonly fetchImpl: typeof fetch = fetch
  ) {
    this.config = normalizeConfig(config);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.config.url}/rest/v1/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        authorization: `Bearer ${this.config.serviceRoleKey}`,
        "content-type": "application/json",
        "accept-profile": this.config.schema,
        "content-profile": this.config.schema,
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new SupabasePersistenceError(
        response.status,
        `${init.method ?? "GET"} ${path}`,
        text || response.statusText
      );
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export interface PersistentJobClaim {
  claimed: boolean;
  status: string;
}

export class SupabaseIngestionLedger {
  constructor(readonly client: SupabasePostgrestClient) {}

  async claim(job: IngestionJob): Promise<PersistentJobClaim> {
    const rows = await this.client.request<ReadonlyArray<{ claimed: boolean; job_status: string }>>(
      "rpc/claim_ingestion_job",
      {
        method: "POST",
        body: JSON.stringify({
          p_id: job.id,
          p_idempotency_key: job.idempotencyKey,
          p_source_id: job.sourceId,
          p_product_id: job.productId,
          p_requirement_id: job.requirementId,
          p_entity_type: job.entityType,
          p_scheduled_for: job.scheduledFor,
          p_max_attempts: job.maxAttempts
        })
      }
    );
    const row = rows[0];
    if (!row) throw new Error("Supabase claim_ingestion_job returned no row");
    return { claimed: row.claimed, status: row.job_status };
  }

  async complete(job: IngestionJob, now: Date): Promise<void> {
    await this.client.request<void>(`ingestion_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ status: "succeeded", completed_at: now.toISOString(), updated_at: now.toISOString(), error: null })
    });
  }

  async fail(job: IngestionJob, error: unknown, now: Date): Promise<void> {
    await this.client.request<void>(`ingestion_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        status: "failed",
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
        error: error instanceof Error ? error.message : "Ingestion failed"
      })
    });
  }
}

interface StoredVersionRow {
  namespace: string;
  record_id: string;
  subject: string;
  content_hash: string;
  content: MaiAdmissionProgram;
  evidence: ReadonlyArray<EvidenceRecord>;
  source_url: string;
  source_version: number;
  created_at: string;
  updated_at: string;
}

export class SupabaseVersionStore {
  constructor(readonly client: SupabasePostgrestClient) {}

  async save(version: VersionedMemoryRecord<MaiAdmissionProgram>): Promise<void> {
    const contentHash = String(version.metadata?.contentHash ?? "");
    const sourceUrl = String(version.metadata?.sourceUrl ?? version.content.sourceUrl);
    if (!contentHash) throw new Error("Version contentHash metadata is required");

    await this.client.request<void>("data_versions?on_conflict=namespace,record_id,content_hash", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        namespace: version.namespace,
        record_id: version.id,
        subject: version.subject,
        content_hash: contentHash,
        content: version.content,
        evidence: version.evidence,
        source_url: sourceUrl,
        source_version: version.version,
        created_at: version.createdAt,
        updated_at: version.updatedAt
      })
    });

    if (version.evidence.length > 0) {
      await this.client.request<void>("evidence_records?on_conflict=evidence_id", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(version.evidence.map((item) => ({
          evidence_id: item.id,
          namespace: version.namespace,
          record_id: version.id,
          source_type: item.sourceType,
          source_ref: item.sourceRef,
          quote: item.quote ?? null,
          status: item.status,
          captured_at: item.capturedAt,
          metadata: item.metadata ?? null
        })))
      });
    }
  }

  async list(namespace: string): Promise<ReadonlyArray<VersionedMemoryRecord<MaiAdmissionProgram>>> {
    const rows = await this.client.request<ReadonlyArray<StoredVersionRow>>(
      `data_versions?namespace=eq.${encodeURIComponent(namespace)}&select=namespace,record_id,subject,content_hash,content,evidence,source_url,source_version,created_at,updated_at&order=subject.asc`
    );
    return rows.map((row) => ({
      id: row.record_id,
      namespace: row.namespace,
      subject: row.subject,
      content: structuredClone(row.content),
      evidence: structuredClone(row.evidence),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.source_version,
      metadata: { contentHash: row.content_hash, sourceUrl: row.source_url }
    }));
  }
}

export class SupabaseSourceCheckpointStore {
  constructor(readonly client: SupabasePostgrestClient) {}

  async save(input: {
    sourceId: string;
    checkedAt: Date;
    successfulAt?: Date;
    contentHash?: string;
    jobId: string;
    status: SourceStatus;
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    await this.client.request<void>("source_checkpoints?on_conflict=source_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        source_id: input.sourceId,
        last_checked_at: input.checkedAt.toISOString(),
        last_successful_at: input.successfulAt?.toISOString() ?? null,
        content_hash: input.contentHash ?? null,
        last_job_id: input.jobId,
        status: input.status,
        metadata: input.metadata ?? null,
        updated_at: input.checkedAt.toISOString()
      })
    });
  }
}

export interface PersistentMaiSliceResult extends MaiSliceResult {
  persistedCount: number;
  persistentDuplicate: boolean;
}

function indexPersistedVersions(
  versions: ReadonlyArray<VersionedMemoryRecord<MaiAdmissionProgram>>,
  retrieval: InMemoryLexicalRetrievalProvider
): void {
  for (const version of versions) {
    const record = version.content;
    try {
      retrieval.add({
        id: version.id,
        namespace: version.namespace,
        content: [record.title, record.code, record.city, record.studyForm, ...record.exams].join(" "),
        source: record.sourceUrl,
        evidence: version.evidence,
        metadata: { admissionYear: record.admissionYear, institution: record.institution }
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Document already indexed")) throw error;
    }
  }
}

export async function runPersistentMaiVerticalSlice(input: {
  job: IngestionJob;
  html: string;
  query: string;
  now: Date;
  ledger: SupabaseIngestionLedger;
  versions: SupabaseVersionStore;
  checkpoints: SupabaseSourceCheckpointStore;
  retrieval?: InMemoryLexicalRetrievalProvider;
}): Promise<PersistentMaiSliceResult> {
  const retrieval = input.retrieval ?? new InMemoryLexicalRetrievalProvider();
  const claim = await input.ledger.claim(input.job);

  if (!claim.claimed) {
    const persisted = await input.versions.list("proidu:mai:2026");
    indexPersistedVersions(persisted, retrieval);
    const searchResults = await retrieval.search({ text: input.query, filters: { namespace: "proidu:mai:2026" } });
    return {
      job: input.job,
      duplicate: true,
      persistentDuplicate: true,
      parsedCount: 0,
      quarantinedCount: 0,
      versions: persisted,
      persistedCount: persisted.length,
      searchResults
    };
  }

  try {
    const result = await runMaiVerticalSlice({
      job: input.job,
      html: input.html,
      query: input.query,
      now: input.now,
      ledger: new InMemoryIngestionLedger(),
      memory: new InMemoryEvidenceProvider("verified-only"),
      retrieval
    });

    for (const version of result.versions) await input.versions.save(version);
    const contentHash = result.versions[0]?.metadata?.contentHash;
    await input.checkpoints.save({
      sourceId: input.job.sourceId,
      checkedAt: input.now,
      successfulAt: input.now,
      ...(typeof contentHash === "string" ? { contentHash } : {}),
      jobId: input.job.id,
      status: "active",
      metadata: { parsedCount: result.parsedCount, quarantinedCount: result.quarantinedCount }
    });
    await input.ledger.complete(input.job, input.now);
    return { ...result, persistentDuplicate: false, persistedCount: result.versions.length };
  } catch (error) {
    await input.checkpoints.save({
      sourceId: input.job.sourceId,
      checkedAt: input.now,
      jobId: input.job.id,
      status: "degraded",
      metadata: { error: error instanceof Error ? error.message : "Ingestion failed" }
    });
    await input.ledger.fail(input.job, error, input.now);
    throw error;
  }
}
