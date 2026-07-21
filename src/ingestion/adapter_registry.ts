export type AdapterKind =
  | "html"
  | "sitemap"
  | "pdf"
  | "api"
  | "archive"
  | "fallback";

export interface IngestionAdapter {
  kind: AdapterKind;
  supports(input: { url: string; contentType?: string }): boolean;
  execute(input: { url: string }): Promise<unknown>;
}

export class AdapterRegistry {
  private adapters: IngestionAdapter[] = [];

  register(adapter: IngestionAdapter) {
    this.adapters.push(adapter);
  }

  resolve(input: { url: string; contentType?: string }) {
    return (
      this.adapters.find((adapter) => adapter.supports(input)) ??
      this.adapters.find((adapter) => adapter.kind === "fallback")
    );
  }

  list() {
    return this.adapters.map((adapter) => adapter.kind);
  }
}
