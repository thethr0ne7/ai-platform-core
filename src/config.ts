import type {
  CapabilityId,
  ProductDefinition,
  ProductStatus
} from "./contracts.js";

export const capabilities = [
  "orchestration",
  "memory",
  "rag-search",
  "knowledge-base",
  "auth",
  "analytics",
  "billing",
  "ui-system"
] as const satisfies ReadonlyArray<CapabilityId>;

const capabilitySet = new Set<string>(capabilities);
const productStatuses = new Set<ProductStatus>(["active", "planned", "parked"]);
const productIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PlatformConfig {
  products: ProductDefinition[];
}

export class ConfigurationValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ConfigurationValidationError";
    this.path = path;
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationValidationError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function parseProductDefinition(value: unknown, path = "product"): ProductDefinition {
  const candidate = requireRecord(value, path);

  if (typeof candidate.id !== "string" || !productIdPattern.test(candidate.id)) {
    throw new ConfigurationValidationError(
      `${path}.id`,
      "must use lowercase kebab-case"
    );
  }

  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    throw new ConfigurationValidationError(`${path}.name`, "must be a non-empty string");
  }

  if (
    typeof candidate.status !== "string" ||
    !productStatuses.has(candidate.status as ProductStatus)
  ) {
    throw new ConfigurationValidationError(
      `${path}.status`,
      "must be active, planned, or parked"
    );
  }

  if (!Array.isArray(candidate.capabilities)) {
    throw new ConfigurationValidationError(`${path}.capabilities`, "must be an array");
  }

  const parsedCapabilities = candidate.capabilities.map((capability, index) => {
    if (typeof capability !== "string" || !capabilitySet.has(capability)) {
      throw new ConfigurationValidationError(
        `${path}.capabilities[${index}]`,
        `unknown capability: ${String(capability)}`
      );
    }
    return capability as CapabilityId;
  });

  if (new Set(parsedCapabilities).size !== parsedCapabilities.length) {
    throw new ConfigurationValidationError(
      `${path}.capabilities`,
      "must not contain duplicates"
    );
  }

  return {
    id: candidate.id,
    name: candidate.name.trim(),
    status: candidate.status as ProductStatus,
    capabilities: [...parsedCapabilities]
  };
}

export function parsePlatformConfig(value: unknown): PlatformConfig {
  const candidate = requireRecord(value, "config");
  if (!Array.isArray(candidate.products)) {
    throw new ConfigurationValidationError("config.products", "must be an array");
  }

  const products = candidate.products.map((product, index) =>
    parseProductDefinition(product, `config.products[${index}]`)
  );

  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.id)) {
      throw new ConfigurationValidationError(
        "config.products",
        `duplicate product id: ${product.id}`
      );
    }
    seen.add(product.id);
  }

  return { products };
}
