import { createHash, randomUUID } from "node:crypto";
import type { ProductId } from "./contracts.js";

export type SourceStatus = "active" | "degraded" | "blocked" | "retired" | "needs-review";
export type SourceTrust = "official" | "authoritative" | "secondary";
export type PublicationMode = "automatic" | "quarantine" | "manual-review";
export type IngestionJobStatus = "pending" | "leased" | "running" | "succeeded" | "failed" | "dead-letter";

export interface FreshnessPolicy {
  maximumAgeHours: number;
  checkIntervalHours: number;
}

export interface SourcePolicy {
  officialOnly: boolean;
  allowedDomains: ReadonlyArray<string>;
  minimumTrust: SourceTrust;
}

export interface PublicationPolicy {
  mode: PublicationMode;
  requireEvidence: boolean;
  minimumEvidence: number;
  requireValidation: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}

export interface ProductDataRequirement {
  id: string;
  productId: ProductId;
  entityType: string;
  requiredFields: ReadonlyArray<string>;
  freshness: FreshnessPolicy;
  sourcePolicy: SourcePolicy;
  publicationPolicy: PublicationPolicy;
}

export interface SourceDefinition {
  id: string;
  productId: ProductId;
  requirementId: string;
  entityType: string;
  url: string;
  trust: SourceTrust;
  status: SourceStatus;
  checkIntervalHours: number;
  lastCheckedAt?: string;
  lastSuccessfulAt?: string;
  contentHash?: string;
  retryPolicy: RetryPolicy;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface IngestionJob {
  id: string;
  idempotencyKey: string;
  sourceId: string;
  productId: ProductId;
  requirementId: string;
  entityType: string;
  scheduledFor: string;
  status: IngestionJobStatus;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
}

export class AutonomousDataValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "AutonomousDataValidationError";
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function requireText(value: string, path: string): string {
  const normalized = value.trim();
  if (!normalized) throw new AutonomousDataValidationError(path, "must not be empty");
  return normalized;
}

function requirePositiveInteger(value: number, path: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AutonomousDataValidationError(path, `must be an integer from 1 to ${maximum}`);
  }
  return value;
}

function normalizeDomain(domain: string, path: string): string {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    throw new AutonomousDataValidationError(path, "must be a valid domain");
  }
  return normalized;
}

function hostMatches(host: string, allowedDomain: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/^www\./, "");
  return normalizedHost === allowedDomain || normalizedHost.endsWith(`.${allowedDomain}`);
}

const trustRank: Readonly<Record<SourceTrust, number>> = {
  secondary: 0,
  authoritative: 1,
  official: 2
};

export function validateRequirement(input: ProductDataRequirement): ProductDataRequirement {
  const id = requireText(input.id, "requirement.id");
  const productId = requireText(input.productId, "requirement.productId");
  const entityType = requireText(input.entityType, "requirement.entityType");
  if (input.requiredFields.length === 0) {
    throw new AutonomousDataValidationError("requirement.requiredFields", "must contain at least one field");
  }
  const requiredFields = input.requiredFields.map((field, index) => requireText(field, `requirement.requiredFields[${index}]`));
  if (new Set(requiredFields).size !== requiredFields.length) {
    throw new AutonomousDataValidationError("requirement.requiredFields", "must not contain duplicates");
  }
  const allowedDomains = input.sourcePolicy.allowedDomains.map((domain, index) =>
    normalizeDomain(domain, `requirement.sourcePolicy.allowedDomains[${index}]`)
  );
  if (allowedDomains.length === 0) {
    throw new AutonomousDataValidationError("requirement.sourcePolicy.allowedDomains", "must contain at least one domain");
  }
  if (new Set(allowedDomains).size !== allowedDomains.length) {
    throw new AutonomousDataValidationError("requirement.sourcePolicy.allowedDomains", "must not contain duplicates");
  }
  const minimumEvidence = requirePositiveInteger(
    input.publicationPolicy.minimumEvidence,
    "requirement.publicationPolicy.minimumEvidence",
    100
  );
  if (!input.publicationPolicy.requireEvidence && minimumEvidence > 1) {
    throw new AutonomousDataValidationError(
      "requirement.publicationPolicy",
      "minimumEvidence above 1 requires requireEvidence=true"
    );
  }
  return copy({
    ...input,
    id,
    productId,
    entityType,
    requiredFields,
    freshness: {
      maximumAgeHours: requirePositiveInteger(input.freshness.maximumAgeHours, "requirement.freshness.maximumAgeHours", 8760),
      checkIntervalHours: requirePositiveInteger(input.freshness.checkIntervalHours, "requirement.freshness.checkIntervalHours", 8760)
    },
    sourcePolicy: { ...input.sourcePolicy, allowedDomains },
    publicationPolicy: { ...input.publicationPolicy, minimumEvidence }
  });
}

export function validateSource(input: SourceDefinition, requirement: ProductDataRequirement): SourceDefinition {
  const id = requireText(input.id, "source.id");
  if (input.productId !== requirement.productId) {
    throw new AutonomousDataValidationError("source.productId", "must match requirement productId");
  }
  if (input.requirementId !== requirement.id) {
    throw new AutonomousDataValidationError("source.requirementId", "must match requirement id");
  }
  if (input.entityType !== requirement.entityType) {
    throw new AutonomousDataValidationError("source.entityType", "must match requirement entityType");
  }
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new AutonomousDataValidationError("source.url", "must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new AutonomousDataValidationError("source.url", "must use HTTPS");
  }
  if (!requirement.sourcePolicy.allowedDomains.some((domain) => hostMatches(url.hostname, domain))) {
    throw new AutonomousDataValidationError("source.url", "domain is not allowed by the requirement");
  }
  if (requirement.sourcePolicy.officialOnly && input.trust !== "official") {
    throw new AutonomousDataValidationError("source.trust", "official-only requirement rejects non-official sources");
  }
  if (trustRank[input.trust] < trustRank[requirement.sourcePolicy.minimumTrust]) {
    throw new AutonomousDataValidationError("source.trust", "is below the minimum required trust level");
  }
  const maxAttempts = requirePositiveInteger(input.retryPolicy.maxAttempts, "source.retryPolicy.maxAttempts", 20);
  const baseDelaySeconds = requirePositiveInteger(input.retryPolicy.baseDelaySeconds, "source.retryPolicy.baseDelaySeconds", 86400);
  const maxDelaySeconds = requirePositiveInteger(input.retryPolicy.maxDelaySeconds, "source.retryPolicy.maxDelaySeconds", 604800);
  if (baseDelaySeconds > maxDelaySeconds) {
    throw new AutonomousDataValidationError("source.retryPolicy", "baseDelaySeconds must not exceed maxDelaySeconds");
  }
  return copy({
    ...input,
    id,
    url: url.toString(),
    checkIntervalHours: requirePositiveInteger(input.checkIntervalHours, "source.checkIntervalHours", 8760),
    retryPolicy: { maxAttempts, baseDelaySeconds, maxDelaySeconds }
  });
}

export class SourceRegistry {
  readonly #requirements = new Map<string, ProductDataRequirement>();
  readonly #sources = new Map<string, SourceDefinition>();

  constructor(requirements: ReadonlyArray<ProductDataRequirement> = [], sources: ReadonlyArray<SourceDefinition> = []) {
    for (const requirement of requirements) this.registerRequirement(requirement);
    for (const source of sources) this.registerSource(source);
  }

  registerRequirement(input: ProductDataRequirement): this {
    const requirement = validateRequirement(input);
    if (this.#requirements.has(requirement.id)) {
      throw new AutonomousDataValidationError("requirement.id", `duplicate requirement: ${requirement.id}`);
    }
    this.#requirements.set(requirement.id, requirement);
    return this;
  }

  registerSource(input: SourceDefinition): this {
    if (this.#sources.has(input.id)) {
      throw new AutonomousDataValidationError("source.id", `duplicate source: ${input.id}`);
    }
    const requirement = this.#requirements.get(input.requirementId);
    if (!requirement) {
      throw new AutonomousDataValidationError("source.requirementId", `unknown requirement: ${input.requirementId}`);
    }
    const source = validateSource(input, requirement);
    this.#sources.set(source.id, source);
    return this;
  }

  getRequirement(id: string): ProductDataRequirement | undefined {
    const item = this.#requirements.get(id);
    return item ? copy(item) : undefined;
  }

  getSource(id: string): SourceDefinition | undefined {
    const item = this.#sources.get(id);
    return item ? copy(item) : undefined;
  }

  listSources(productId?: ProductId): ReadonlyArray<SourceDefinition> {
    return [...this.#sources.values()]
      .filter((source) => !productId || source.productId === productId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copy);
  }

  dueSources(now: Date, productId?: ProductId): ReadonlyArray<SourceDefinition> {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new AutonomousDataValidationError("now", "must be a valid date");
    return this.listSources(productId).filter((source) => {
      if (source.status !== "active" && source.status !== "degraded") return false;
      if (!source.lastCheckedAt) return true;
      const checkedMs = Date.parse(source.lastCheckedAt);
      if (!Number.isFinite(checkedMs)) return true;
      return nowMs - checkedMs >= source.checkIntervalHours * 60 * 60 * 1000;
    });
  }
}

function scheduledWindow(source: SourceDefinition, now: Date): string {
  const intervalMs = source.checkIntervalHours * 60 * 60 * 1000;
  const windowStart = Math.floor(now.getTime() / intervalMs) * intervalMs;
  return new Date(windowStart).toISOString();
}

export function createIngestionJob(source: SourceDefinition, now: Date): IngestionJob {
  const scheduledFor = scheduledWindow(source, now);
  const idempotencyKey = `${source.id}:${scheduledFor}`;
  const id = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
  return {
    id,
    idempotencyKey,
    sourceId: source.id,
    productId: source.productId,
    requirementId: source.requirementId,
    entityType: source.entityType,
    scheduledFor,
    status: "pending",
    attempt: 0,
    maxAttempts: source.retryPolicy.maxAttempts,
    createdAt: now.toISOString()
  };
}

export function planDueIngestionJobs(registry: SourceRegistry, now: Date, productId?: ProductId): ReadonlyArray<IngestionJob> {
  return registry.dueSources(now, productId).map((source) => createIngestionJob(source, now));
}

export function newSourceId(prefix = "source"): string {
  return `${prefix}.${randomUUID()}`;
}
