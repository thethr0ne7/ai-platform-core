import { capabilities, parsePlatformConfig } from "./config.js";
import type { PlatformConfig } from "./config.js";
import type { ProductDefinition, ProductId } from "./contracts.js";

export class ProductRegistry {
  readonly #products: Map<ProductId, Readonly<ProductDefinition>>;

  constructor(config: PlatformConfig | unknown) {
    const parsed = parsePlatformConfig(config);
    this.#products = new Map(
      parsed.products.map((product) => {
        const frozen = Object.freeze({
          ...product,
          capabilities: Object.freeze([...product.capabilities])
        }) as Readonly<ProductDefinition>;
        return [frozen.id, frozen];
      })
    );
  }

  get(productId: ProductId): ProductDefinition | undefined {
    const product = this.#products.get(productId);
    if (!product) return undefined;
    return {
      ...product,
      capabilities: [...product.capabilities]
    };
  }

  has(productId: ProductId): boolean {
    return this.#products.has(productId);
  }

  list(): ProductDefinition[] {
    return [...this.#products.values()].map((product) => ({
      ...product,
      capabilities: [...product.capabilities]
    }));
  }
}

export const defaultPlatformConfig = {
  products: [
    {
      id: "proidu",
      name: "PROIDU",
      status: "active",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "knowledge-base",
        "auth",
        "analytics",
        "ui-system"
      ]
    },
    {
      id: "grant-ai",
      name: "Grant AI",
      status: "planned",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "knowledge-base",
        "auth",
        "analytics",
        "billing",
        "ui-system"
      ]
    },
    {
      id: "agro-ai",
      name: "Agro AI",
      status: "planned",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "knowledge-base",
        "analytics",
        "ui-system"
      ]
    },
    {
      id: "tourism-ai",
      name: "Tourism AI",
      status: "planned",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "auth",
        "analytics",
        "billing",
        "ui-system"
      ]
    },
    {
      id: "education-ai",
      name: "Education AI",
      status: "planned",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "knowledge-base",
        "auth",
        "analytics",
        "ui-system"
      ]
    },
    {
      id: "government-intelligence",
      name: "Government Intelligence",
      status: "planned",
      capabilities: [
        "orchestration",
        "memory",
        "rag-search",
        "knowledge-base",
        "analytics"
      ]
    }
  ]
} satisfies PlatformConfig;

export const productRegistry = new ProductRegistry(defaultPlatformConfig);
export const products: ReadonlyArray<ProductDefinition> = Object.freeze(productRegistry.list());
export { capabilities };

export function getProduct(productId: ProductId): ProductDefinition | undefined {
  return productRegistry.get(productId);
}
