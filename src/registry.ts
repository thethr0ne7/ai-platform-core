import type { CapabilityId, ProductDefinition, ProductId } from "./contracts.js";

export const capabilities: ReadonlyArray<CapabilityId> = [
  "orchestration",
  "memory",
  "rag-search",
  "knowledge-base",
  "auth",
  "analytics",
  "billing",
  "ui-system"
];

export const products: ReadonlyArray<ProductDefinition> = [
  {
    id: "proidu",
    name: "PROIDU",
    status: "active",
    capabilities: ["orchestration", "memory", "rag-search", "knowledge-base", "auth", "analytics", "ui-system"]
  },
  {
    id: "grant-ai",
    name: "Grant AI",
    status: "planned",
    capabilities: ["orchestration", "memory", "rag-search", "knowledge-base", "auth", "analytics", "billing", "ui-system"]
  },
  {
    id: "agro-ai",
    name: "Agro AI",
    status: "planned",
    capabilities: ["orchestration", "memory", "rag-search", "knowledge-base", "analytics", "ui-system"]
  },
  {
    id: "tourism-ai",
    name: "Tourism AI",
    status: "planned",
    capabilities: ["orchestration", "memory", "rag-search", "auth", "analytics", "billing", "ui-system"]
  },
  {
    id: "education-ai",
    name: "Education AI",
    status: "planned",
    capabilities: ["orchestration", "memory", "rag-search", "knowledge-base", "auth", "analytics", "ui-system"]
  },
  {
    id: "government-intelligence",
    name: "Government Intelligence",
    status: "planned",
    capabilities: ["orchestration", "memory", "rag-search", "knowledge-base", "analytics"]
  }
];

export function getProduct(productId: ProductId): ProductDefinition | undefined {
  return products.find((product) => product.id === productId);
}
