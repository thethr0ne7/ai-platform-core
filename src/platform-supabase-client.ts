import { SupabasePostgrestClient } from "./supabase-persistence.js";

const rewrites: Array<[string, string]> = [
  ["rpc/claim_ingestion_job", "rpc/claim_platform_ingestion_job"],
  ["ingestion_jobs", "platform_ingestion_jobs"],
  ["data_versions", "platform_data_versions"],
  ["evidence_records", "platform_evidence_records"],
  ["source_checkpoints", "platform_source_checkpoints"]
];

export class PlatformSupabasePostgrestClient extends SupabasePostgrestClient {
  override request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const mapping = rewrites.find(([from]) => path === from || path.startsWith(from + "?"));
    const rewritten = mapping ? mapping[1] + path.slice(mapping[0].length) : path;
    return super.request<T>(rewritten, init);
  }
}
