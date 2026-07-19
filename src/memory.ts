import { randomUUID } from "node:crypto";
import { emptyEventBus, type EventBus } from "./events.js";
import type { MemoryProvider, MemoryRecord as LegacyMemoryRecord } from "./providers.js";

export type EvidenceStatus = "verified" | "unverified" | "inferred" | "rejected";
export type EvidenceSourceType = "document" | "url" | "event" | "user-input" | "system";
export type EvidencePolicy = "allow-unverified" | "require-evidence" | "verified-only";

export interface EvidenceRecord {
  id: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  quote?: string;
  status: EvidenceStatus;
  capturedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface VersionedMemoryRecord<TContent = unknown> {
  id: string;
  namespace: string;
  subject: string;
  content: TContent;
  evidence: ReadonlyArray<EvidenceRecord>;
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryWriteInput<TContent = unknown> {
  id?: string;
  namespace: string;
  subject: string;
  content: TContent;
  evidence?: ReadonlyArray<EvidenceRecord>;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryTraceContext {
  requestId: string;
  traceId: string;
  productId?: string;
}

export class MemoryPolicyError extends Error {
  constructor(readonly policy: EvidencePolicy, message: string) {
    super(message);
    this.name = "MemoryPolicyError";
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function validateEvidence(policy: EvidencePolicy, evidence: ReadonlyArray<EvidenceRecord>): void {
  if (policy === "require-evidence" && evidence.length === 0) {
    throw new MemoryPolicyError(policy, "At least one evidence record is required");
  }
  if (policy === "verified-only" && (evidence.length === 0 || evidence.some((item) => item.status !== "verified"))) {
    throw new MemoryPolicyError(policy, "All evidence records must be verified");
  }
}

export class InMemoryEvidenceProvider implements MemoryProvider {
  readonly kind = "memory" as const;
  readonly id = "memory.in-process.evidence";
  readonly version = "0.7.0";
  readonly #versions = new Map<string, VersionedMemoryRecord[]>();

  constructor(
    readonly policy: EvidencePolicy = "allow-unverified",
    readonly events: EventBus = emptyEventBus
  ) {}

  async put<TContent>(input: MemoryWriteInput<TContent>, trace?: MemoryTraceContext): Promise<VersionedMemoryRecord<TContent>> {
    const id = input.id?.trim() || randomUUID();
    const namespace = input.namespace.trim();
    const subject = input.subject.trim();
    if (!namespace) throw new Error("Memory namespace is required");
    if (!subject) throw new Error("Memory subject is required");

    const eventContext = trace ?? { requestId: randomUUID(), traceId: randomUUID() };
    await this.events.publish({
      type: "memory.write.requested",
      ...eventContext,
      payload: { id, namespace, subject, policy: this.policy }
    });

    const evidence = copy(input.evidence ?? []);
    try {
      validateEvidence(this.policy, evidence);
    } catch (error) {
      await this.events.publish({
        type: "memory.write.rejected",
        ...eventContext,
        payload: { id, namespace, subject, reason: error instanceof Error ? error.message : "Rejected" }
      });
      throw error;
    }

    const key = `${namespace}:${id}`;
    const history = this.#versions.get(key) ?? [];
    const now = new Date().toISOString();
    const record: VersionedMemoryRecord<TContent> = {
      id,
      namespace,
      subject,
      content: copy(input.content),
      evidence,
      createdAt: history[0]?.createdAt ?? now,
      updatedAt: now,
      version: history.length + 1,
      ...(input.metadata ? { metadata: copy(input.metadata) } : {})
    };
    history.push(copy(record));
    this.#versions.set(key, history);

    await this.events.publish({
      type: "memory.version.created",
      ...eventContext,
      payload: { id, namespace, version: record.version }
    });
    if (evidence.length > 0) {
      await this.events.publish({
        type: "evidence.attached",
        ...eventContext,
        payload: { id, namespace, evidenceIds: evidence.map((item) => item.id) }
      });
    }
    await this.events.publish({
      type: "memory.write.completed",
      ...eventContext,
      payload: { id, namespace, subject, version: record.version }
    });

    return copy(record);
  }

  async read<TContent = unknown>(namespace: string, id: string): Promise<VersionedMemoryRecord<TContent> | undefined> {
    const history = this.#versions.get(`${namespace}:${id}`);
    return history?.length ? copy(history[history.length - 1] as VersionedMemoryRecord<TContent>) : undefined;
  }

  async history<TContent = unknown>(namespace: string, id: string): Promise<ReadonlyArray<VersionedMemoryRecord<TContent>>> {
    return copy((this.#versions.get(`${namespace}:${id}`) ?? []) as VersionedMemoryRecord<TContent>[]);
  }

  async list(namespace: string): Promise<ReadonlyArray<VersionedMemoryRecord>> {
    const records: VersionedMemoryRecord[] = [];
    for (const history of this.#versions.values()) {
      const latest = history[history.length - 1];
      if (latest?.namespace === namespace) records.push(copy(latest));
    }
    return records.sort((a, b) => a.subject.localeCompare(b.subject));
  }

  async findBySubject(namespace: string, subject: string): Promise<ReadonlyArray<VersionedMemoryRecord>> {
    return (await this.list(namespace)).filter((record) => record.subject === subject);
  }

  async get<TValue = unknown>(key: string): Promise<LegacyMemoryRecord<TValue> | undefined> {
    const separator = key.indexOf(":");
    if (separator < 1) return undefined;
    const namespace = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const record = await this.read<TValue>(namespace, id);
    return record ? { key, value: record.content, updatedAt: record.updatedAt, metadata: record.metadata } : undefined;
  }

  async set<TValue = unknown>(record: LegacyMemoryRecord<TValue>): Promise<void> {
    const separator = record.key.indexOf(":");
    if (separator < 1) throw new Error("Memory key must use namespace:id format");
    await this.put({
      namespace: record.key.slice(0, separator),
      id: record.key.slice(separator + 1),
      subject: record.key,
      content: record.value,
      metadata: record.metadata
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.#versions.delete(key);
  }
}