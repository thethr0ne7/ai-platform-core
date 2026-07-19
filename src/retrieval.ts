import { randomUUID } from "node:crypto";
import { emptyEventBus, type EventBus } from "./events.js";
import type { EvidenceRecord } from "./memory.js";
import type { RetrievalProvider, RetrievalQuery, RetrievalResult } from "./providers.js";

export interface RetrievalDocument {
  id: string;
  namespace: string;
  content: string;
  source: string;
  evidence: ReadonlyArray<EvidenceRecord>;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface GroundedRetrievalResult extends RetrievalResult {
  namespace: string;
  evidence: ReadonlyArray<EvidenceRecord>;
  matchedTerms: ReadonlyArray<string>;
}

export interface RetrievalTraceContext {
  requestId: string;
  traceId: string;
  productId?: string;
}

export interface GroundedContext {
  query: string;
  namespace: string;
  passages: ReadonlyArray<GroundedRetrievalResult>;
  citations: ReadonlyArray<EvidenceRecord>;
}

export class RetrievalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalValidationError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function tokens(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function frequencies(values: ReadonlyArray<string>): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function namespaceFrom(query: RetrievalQuery): string {
  const value = query.filters?.namespace;
  if (typeof value !== "string" || !value.trim()) {
    throw new RetrievalValidationError("filters.namespace is required");
  }
  return value.trim();
}

function matchesMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  filters: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!filters) return true;
  for (const [key, expected] of Object.entries(filters)) {
    if (key === "namespace") continue;
    if (metadata?.[key] !== expected) return false;
  }
  return true;
}

/**
 * Reference lexical retrieval provider.
 *
 * Indexing time: O(T), where T is the number of document tokens.
 * Index space: O(T + D), where D is the number of documents.
 * Search time: O(Q + C log C), where Q is query tokens and C is candidate documents.
 */
export class InMemoryLexicalRetrievalProvider implements RetrievalProvider {
  readonly kind = "retrieval" as const;
  readonly id = "retrieval.in-process.lexical";
  readonly version = "0.8.0";

  readonly #documents = new Map<string, RetrievalDocument>();
  readonly #index = new Map<string, Map<string, Map<string, number>>>();

  constructor(readonly events: EventBus = emptyEventBus) {}

  add(document: RetrievalDocument): void {
    const id = document.id.trim();
    const namespace = document.namespace.trim();
    const content = document.content.trim();
    if (!id) throw new RetrievalValidationError("Document id is required");
    if (!namespace) throw new RetrievalValidationError("Document namespace is required");
    if (!content) throw new RetrievalValidationError("Document content is required");

    const key = `${namespace}:${id}`;
    if (this.#documents.has(key)) throw new RetrievalValidationError(`Document already indexed: ${key}`);

    const stored = clone({ ...document, id, namespace, content });
    this.#documents.set(key, stored);
    const namespaceIndex = this.#index.get(namespace) ?? new Map<string, Map<string, number>>();
    for (const [token, count] of frequencies(tokens(content))) {
      const postings = namespaceIndex.get(token) ?? new Map<string, number>();
      postings.set(key, count);
      namespaceIndex.set(token, postings);
    }
    this.#index.set(namespace, namespaceIndex);
  }

  remove(namespace: string, id: string): boolean {
    const key = `${namespace}:${id}`;
    const document = this.#documents.get(key);
    if (!document) return false;
    this.#documents.delete(key);
    const namespaceIndex = this.#index.get(namespace);
    if (namespaceIndex) {
      for (const token of new Set(tokens(document.content))) {
        const postings = namespaceIndex.get(token);
        postings?.delete(key);
        if (postings?.size === 0) namespaceIndex.delete(token);
      }
      if (namespaceIndex.size === 0) this.#index.delete(namespace);
    }
    return true;
  }

  async search(query: RetrievalQuery): Promise<ReadonlyArray<GroundedRetrievalResult>> {
    return this.searchGrounded(query, { requestId: randomUUID(), traceId: randomUUID() });
  }

  async searchGrounded(
    query: RetrievalQuery,
    trace: RetrievalTraceContext
  ): Promise<ReadonlyArray<GroundedRetrievalResult>> {
    const text = query.text.trim();
    const namespace = namespaceFrom(query);
    const limit = query.limit ?? 10;
    await this.events.publish({
      type: "retrieval.search.requested",
      ...trace,
      payload: { namespace, text, limit }
    });

    try {
      if (!text) throw new RetrievalValidationError("Retrieval query text is required");
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new RetrievalValidationError("Retrieval limit must be an integer from 1 to 100");
      }

      const queryFrequency = frequencies(tokens(text));
      const namespaceIndex = this.#index.get(namespace);
      const scores = new Map<string, { score: number; matched: Set<string> }>();

      if (namespaceIndex) {
        for (const [token, queryCount] of queryFrequency) {
          for (const [key, documentCount] of namespaceIndex.get(token) ?? []) {
            const current = scores.get(key) ?? { score: 0, matched: new Set<string>() };
            current.score += queryCount * documentCount;
            current.matched.add(token);
            scores.set(key, current);
          }
        }
      }

      const results = [...scores.entries()]
        .map(([key, match]) => ({ document: this.#documents.get(key), match }))
        .filter((entry): entry is { document: RetrievalDocument; match: { score: number; matched: Set<string> } } =>
          Boolean(entry.document && matchesMetadata(entry.document.metadata, query.filters))
        )
        .map(({ document, match }) => ({
          id: document.id,
          namespace: document.namespace,
          content: document.content,
          score: match.score / Math.max(1, tokens(document.content).length),
          source: document.source,
          evidence: clone(document.evidence),
          matchedTerms: [...match.matched].sort(),
          ...(document.metadata ? { metadata: clone(document.metadata) } : {})
        }))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
        .slice(0, limit);

      await this.events.publish({
        type: "retrieval.search.completed",
        ...trace,
        payload: { namespace, resultCount: results.length }
      });
      return clone(results);
    } catch (error) {
      await this.events.publish({
        type: "retrieval.search.rejected",
        ...trace,
        payload: { namespace, reason: error instanceof Error ? error.message : "Rejected" }
      });
      throw error;
    }
  }
}

export function assembleGroundedContext(
  query: string,
  namespace: string,
  passages: ReadonlyArray<GroundedRetrievalResult>
): GroundedContext {
  const citations = new Map<string, EvidenceRecord>();
  for (const passage of passages) {
    if (passage.namespace !== namespace) {
      throw new RetrievalValidationError("Grounded context cannot mix namespaces");
    }
    for (const evidence of passage.evidence) citations.set(evidence.id, clone(evidence));
  }
  return clone({ query, namespace, passages, citations: [...citations.values()] });
}
