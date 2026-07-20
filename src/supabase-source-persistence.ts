import type { EvidenceRecord } from "./source-intelligence.js";
import type { SourcePersistence } from "./source-runner.js";

export interface SupabaseSourcePersistenceOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

interface RpcErrorBody {
  message?: string;
  error?: string;
  details?: string;
  hint?: string;
}

export class SupabaseSourcePersistence implements SourcePersistence {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SupabaseSourcePersistenceOptions) {
    const url = new URL(options.supabaseUrl);
    if (url.protocol !== "https:") throw new Error("SUPABASE_URL должен использовать HTTPS");
    if (!options.serviceRoleKey.trim()) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан");

    this.baseUrl = url.toString().replace(/\/$/, "");
    this.serviceRoleKey = options.serviceRoleKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseSourcePersistence {
    const supabaseUrl = env.SUPABASE_URL?.trim();
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) throw new Error("SUPABASE_URL не задан");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан");
    return new SupabaseSourcePersistence({ supabaseUrl, serviceRoleKey });
  }

  async getLatestText(canonicalUrl: string): Promise<string | undefined> {
    const payload = await this.rpc<unknown>("gi_get_latest_source_text", {
      p_canonical_url: canonicalUrl,
    });

    if (typeof payload === "string") return payload || undefined;
    if (Array.isArray(payload)) {
      const first = payload[0];
      if (typeof first === "string") return first || undefined;
      if (first && typeof first === "object") {
        const value = (first as Record<string, unknown>).extracted_text;
        return typeof value === "string" && value.trim() ? value : undefined;
      }
    }
    if (payload && typeof payload === "object") {
      const value = (payload as Record<string, unknown>).extracted_text;
      return typeof value === "string" && value.trim() ? value : undefined;
    }
    return undefined;
  }

  async saveEvidence(record: EvidenceRecord): Promise<void> {
    await this.rpc("gi_persist_source_evidence", {
      p_record: {
        source_id: record.sourceId,
        canonical_url: record.canonicalUrl,
        authority: record.authority,
        title: record.title,
        document_number: record.documentNumber ?? null,
        published_at: record.publishedAt ?? null,
        checked_at: record.checkedAt,
        content_hash: record.contentHash,
        extraction_method: record.extractionMethod,
        extracted_text: record.text,
        citations: record.citations,
        metadata: record.metadata,
      },
    });
  }

  async saveDiscoveryFailure(args: { sourceId: string; message: string; checkedAt: string }): Promise<void> {
    await this.rpc("gi_record_ingestion_failure", {
      p_source_id: args.sourceId,
      p_error_message: args.message,
      p_checked_at: args.checkedAt,
    });
  }

  private async rpc<T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let details = `HTTP ${response.status}`;
      try {
        const payload = await response.json() as RpcErrorBody;
        details = payload.message ?? payload.error ?? payload.details ?? details;
      } catch {
        const text = await response.text().catch(() => "");
        if (text.trim()) details = text.trim();
      }
      throw new Error(`Supabase RPC ${functionName} завершился ошибкой: ${details}`);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text ? JSON.parse(text) as T : undefined as T;
  }
}
