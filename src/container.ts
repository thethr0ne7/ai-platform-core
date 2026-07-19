import type {
  PlatformProvider,
  ProviderIdentity,
  ProviderKind,
  ProviderMap,
  ProviderResolver
} from "./providers.js";

export class ProviderRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistrationError";
  }
}

export class ProviderNotFoundError extends Error {
  readonly kind: ProviderKind;

  constructor(kind: ProviderKind) {
    super(`Required provider is not registered: ${kind}`);
    this.name = "ProviderNotFoundError";
    this.kind = kind;
  }
}

export class DependencyContainer implements ProviderResolver {
  readonly #providers = new Map<ProviderKind, PlatformProvider>();

  register<TKind extends ProviderKind>(provider: ProviderMap[TKind]): this {
    if (this.#providers.has(provider.kind)) {
      throw new ProviderRegistrationError(
        `Provider already registered for kind: ${provider.kind}`
      );
    }

    this.#providers.set(provider.kind, provider);
    return this;
  }

  replace<TKind extends ProviderKind>(provider: ProviderMap[TKind]): this {
    this.#providers.set(provider.kind, provider);
    return this;
  }

  has<TKind extends ProviderKind>(kind: TKind): boolean {
    return this.#providers.has(kind);
  }

  optional<TKind extends ProviderKind>(kind: TKind): ProviderMap[TKind] | undefined {
    return this.#providers.get(kind) as ProviderMap[TKind] | undefined;
  }

  resolve<TKind extends ProviderKind>(kind: TKind): ProviderMap[TKind] {
    const provider = this.optional(kind);
    if (!provider) throw new ProviderNotFoundError(kind);
    return provider;
  }

  list(): ReadonlyArray<ProviderIdentity> {
    return [...this.#providers.values()]
      .map(({ kind, id, version }) => ({
        kind,
        id,
        ...(version ? { version } : {})
      }))
      .sort((left, right) => left.kind.localeCompare(right.kind));
  }

  fork(): DependencyContainer {
    const child = new DependencyContainer();
    for (const provider of this.#providers.values()) child.replace(provider);
    return child;
  }
}

class EmptyProviderResolver implements ProviderResolver {
  has<TKind extends ProviderKind>(_kind: TKind): boolean {
    return false;
  }

  optional<TKind extends ProviderKind>(_kind: TKind): ProviderMap[TKind] | undefined {
    return undefined;
  }

  resolve<TKind extends ProviderKind>(kind: TKind): ProviderMap[TKind] {
    throw new ProviderNotFoundError(kind);
  }

  list(): ReadonlyArray<ProviderIdentity> {
    return [];
  }
}

export const emptyProviderResolver: ProviderResolver = Object.freeze(
  new EmptyProviderResolver()
);
