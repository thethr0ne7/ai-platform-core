import type { ProductId } from "./contracts.js";

export type ProviderKind = "memory" | "retrieval" | "analytics" | "configuration";

export interface ProviderIdentity<TKind extends ProviderKind = ProviderKind> {
  readonly kind: TKind;
  readonly id: string;
  readonly version?: string;
}

export interface MemoryRecord<TValue = unknown> {
  key: string;
  value: TValue;
  updatedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryProvider extends ProviderIdentity<"memory"> {
  get<TValue = unknown>(key: string): Promise<MemoryRecord<TValue> | undefined>;
  set<TValue = unknown>(record: MemoryRecord<TValue>): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface RetrievalQuery {
  text: string;
  limit?: number;
  filters?: Readonly<Record<string, unknown>>;
}

export interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  source?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface RetrievalProvider extends ProviderIdentity<"retrieval"> {
  search(query: RetrievalQuery): Promise<ReadonlyArray<RetrievalResult>>;
}

export interface AnalyticsEvent {
  name: string;
  occurredAt: string;
  productId?: ProductId;
  requestId?: string;
  traceId?: string;
  properties?: Readonly<Record<string, unknown>>;
}

export interface AnalyticsProvider extends ProviderIdentity<"analytics"> {
  track(event: AnalyticsEvent): Promise<void>;
}

export interface ConfigurationProvider extends ProviderIdentity<"configuration"> {
  get(key: string): string | undefined;
  require(key: string): string;
}

export interface ProviderMap {
  memory: MemoryProvider;
  retrieval: RetrievalProvider;
  analytics: AnalyticsProvider;
  configuration: ConfigurationProvider;
}

export type PlatformProvider = ProviderMap[ProviderKind];

export interface ProviderResolver {
  has<TKind extends ProviderKind>(kind: TKind): boolean;
  optional<TKind extends ProviderKind>(kind: TKind): ProviderMap[TKind] | undefined;
  resolve<TKind extends ProviderKind>(kind: TKind): ProviderMap[TKind];
  list(): ReadonlyArray<ProviderIdentity>;
}
