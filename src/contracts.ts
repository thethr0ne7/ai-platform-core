import type { ProviderResolver } from "./providers.js";

export type ProductId =
  | "proidu"
  | "grant-ai"
  | "agro-ai"
  | "tourism-ai"
  | "education-ai"
  | "government-intelligence";

export type CapabilityId =
  | "orchestration"
  | "memory"
  | "rag-search"
  | "knowledge-base"
  | "auth"
  | "analytics"
  | "billing"
  | "ui-system";

export interface ProductDefinition {
  id: ProductId;
  name: string;
  status: "active" | "planned" | "parked";
  capabilities: CapabilityId[];
}

export interface PlatformRequest<TPayload = unknown> {
  requestId?: string;
  productId: ProductId;
  action: string;
  payload: TPayload;
}

export type PlatformErrorCode =
  | "INVALID_REQUEST"
  | "UNKNOWN_PRODUCT"
  | "PRODUCT_NOT_ACTIVE"
  | "UNKNOWN_ACTION"
  | "CAPABILITY_DENIED"
  | "HANDLER_FAILED";

export interface ExecutionContext {
  requestId: string;
  traceId: string;
  product: ProductDefinition;
  action: string;
  startedAt: number;
  providers: ProviderResolver;
}

export interface PlatformSuccess<TData = unknown> {
  ok: true;
  requestId: string;
  traceId: string;
  productId: ProductId;
  action: string;
  durationMs: number;
  capabilitiesUsed: CapabilityId[];
  data: TData;
}

export interface PlatformFailure {
  ok: false;
  requestId: string;
  traceId: string;
  productId?: ProductId;
  action?: string;
  durationMs: number;
  capabilitiesUsed: CapabilityId[];
  error: {
    code: PlatformErrorCode;
    message: string;
  };
}

export type PlatformResult<TData = unknown> = PlatformSuccess<TData> | PlatformFailure;

export interface ActionHandler<TPayload = unknown, TData = unknown> {
  action: string;
  requiredCapabilities: CapabilityId[];
  execute(payload: TPayload, context: ExecutionContext): Promise<TData>;
}
