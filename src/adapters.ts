import type { PlatformRequest, PlatformResult, ProductId } from "./contracts.js";

export interface ProductAdapter<TInput = unknown, TData = unknown, TOutput = PlatformResult<TData>> {
  readonly id: string;
  readonly productId: ProductId;
  readonly action: string;
  toPlatformRequest(input: TInput): PlatformRequest;
  fromPlatformResult(result: PlatformResult<TData>): TOutput;
}

export interface ProductAdapterIdentity {
  id: string;
  productId: ProductId;
  action: string;
}

export class AdapterRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterRegistrationError";
  }
}

export class AdapterNotFoundError extends Error {
  readonly adapterId: string;

  constructor(adapterId: string) {
    super(`Product adapter is not registered: ${adapterId}`);
    this.name = "AdapterNotFoundError";
    this.adapterId = adapterId;
  }
}

export class ProductAdapterRegistry {
  readonly #adapters = new Map<string, ProductAdapter>();

  register(adapter: ProductAdapter): this {
    if (!adapter.id.trim()) {
      throw new AdapterRegistrationError("Adapter id must not be empty");
    }
    if (this.#adapters.has(adapter.id)) {
      throw new AdapterRegistrationError(`Adapter already registered: ${adapter.id}`);
    }
    this.#adapters.set(adapter.id, adapter);
    return this;
  }

  resolve<TAdapter extends ProductAdapter = ProductAdapter>(adapterId: string): TAdapter {
    const adapter = this.#adapters.get(adapterId);
    if (!adapter) throw new AdapterNotFoundError(adapterId);
    return adapter as TAdapter;
  }

  has(adapterId: string): boolean {
    return this.#adapters.has(adapterId);
  }

  list(): ReadonlyArray<ProductAdapterIdentity> {
    return [...this.#adapters.values()]
      .map(({ id, productId, action }) => ({ id, productId, action }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
