import { supabase } from "./supabase";
import { getTelegramInitData } from "./telegram";

export type CatalogueControlSummary = {
  active_measures: number;
  candidate_measures: number;
  machine_candidates: number;
  needs_review_candidates: number;
  human_approved_candidates: number;
  promoted_candidates: number;
  verified_evidence: number;
  verified_requirements: number;
  latest_e2e: {
    status: "passed" | "failed";
    created_at: string;
    summary: Record<string, unknown>;
  } | null;
};

export type CatalogueProject = {
  id: string;
  name: string;
  region: string;
  activity: string;
  status: string;
  updated_at: string;
};

export type MeasureCandidate = {
  id: string;
  candidate_code: string;
  title: string;
  measure_type: string;
  authority: string;
  level: string;
  region: string | null;
  summary: string;
  official_url: string;
  applicant_types: string[];
  sectors: string[];
  max_amount: number | null;
  source_locator: string;
  evidence_quote: string;
  evidence_tier: string;
  owner_validation_status: string;
  candidate_status: "machine_match" | "needs_review" | "human_approved" | "promoted" | "rejected";
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProjectE2EAudit = {
  audit_id: string;
  status: "passed" | "failed";
  gates: Record<string, boolean>;
  summary: Record<string, unknown>;
};

export type CatalogueControlStatus = {
  authorized: boolean;
  role: string | null;
  summary: CatalogueControlSummary;
  projects: CatalogueProject[];
};

function isResponseLike(value: unknown): value is Response {
  return Boolean(
    value
      && typeof value === "object"
      && typeof (value as { clone?: unknown }).clone === "function",
  );
}

async function readCatalogueError(error: unknown): Promise<Error> {
  const fallback = error instanceof Error
    ? error.message
    : "Не удалось обратиться к контуру каталога.";
  const context = (error as { context?: unknown } | null)?.context;

  if (!isResponseLike(context)) return new Error(fallback);

  try {
    const payload = await context.clone().json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error);
    if (typeof payload.message === "string" && payload.message.trim()) return new Error(payload.message);
  } catch {
    try {
      const responseText = await context.clone().text();
      if (responseText.trim()) return new Error(responseText);
    } catch {
      // Preserve the original SDK error when the response body is unavailable.
    }
  }

  return new Error(fallback);
}

async function invokeCatalogueControl<T>(body: Record<string, unknown>): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) throw new Error("Откройте контур каталога через Telegram-бота @stateappstartup_bot.");

  const { data, error } = await supabase.functions.invoke("catalogue-control", {
    body: { initData, ...body },
  });

  if (error) throw await readCatalogueError(error);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function getCatalogueControlStatus() {
  return invokeCatalogueControl<CatalogueControlStatus>({ action: "status" });
}

export function listMeasureCandidates(limit = 100) {
  return invokeCatalogueControl<{
    candidates: MeasureCandidate[];
    summary: CatalogueControlSummary;
    projects: CatalogueProject[];
    role: string;
  }>({ action: "list", limit });
}

export function runProjectDataPlaneE2E(projectId: string) {
  return invokeCatalogueControl<{
    audit: ProjectE2EAudit;
    summary: CatalogueControlSummary;
    projects: CatalogueProject[];
  }>({ action: "run_e2e", projectId });
}
