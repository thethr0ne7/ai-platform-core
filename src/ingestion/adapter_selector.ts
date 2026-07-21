import { AdapterRegistry } from "./adapter_registry.js";

export interface AdapterDecision {
  adapter: string;
  reason: string;
}

export class AdapterSelector {
  constructor(private readonly registry: AdapterRegistry) {}

  select(input: { url: string; contentType?: string }): AdapterDecision {
    const adapter = this.registry.resolve(input);

    if (!adapter) {
      throw new Error("no_ingestion_adapter_available");
    }

    return {
      adapter: adapter.kind,
      reason: `selected_by_capability:${adapter.kind}`,
    };
  }
}
