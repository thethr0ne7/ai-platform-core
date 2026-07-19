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
  requestId: string;
  productId: ProductId;
  action: string;
  payload: TPayload;
}

export interface PlatformResult<TData = unknown> {
  requestId: string;
  productId: ProductId;
  status: "completed" | "rejected";
  capabilitiesUsed: CapabilityId[];
  data?: TData;
  error?: string;
}
