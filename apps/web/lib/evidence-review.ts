import { supabase } from "./supabase";
import { getTelegramInitData } from "./telegram";

export type EvidenceReviewSummary = {
  openTasks: number;
  verifiedTasks: number;
  blockedTasks: number;
  rejectedTasks: number;
  machineMatches: number;
  verifiedEvidence: number;
  verifiedRequirements: number;
};

export type EvidenceReviewTask = {
  task_id: string;
  task_code: string;
  task_type: string;
  task_title: string;
  task_status: string;
  priority: number;
  task_notes: string | null;
  measure_code: string;
  measure_title: string;
  requirement_code: string | null;
  requirement_description: string | null;
  expected_value: unknown;
  candidate_quote: string | null;
  candidate_locator: string | null;
  document_title: string | null;
  canonical_url: string | null;
  evidence_tier: string | null;
  owner_validation_status: string | null;
  source_version_id: string | null;
  source_text_excerpt: string;
  created_at: string;
};

export type EvidenceReviewerStatus = {
  authorized: boolean;
  role: string | null;
  summary: EvidenceReviewSummary;
};

async function invokeEvidenceReview<T>(body: Record<string, unknown>): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) throw new Error("Откройте экспертный контур через Telegram-бота @stateappstartup_bot.");

  const { data, error } = await supabase.functions.invoke("evidence-review", {
    body: { initData, ...body },
  });

  if (error) {
    const context = (error as { context?: Response } | null)?.context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload.error === "string") throw new Error(payload.error);
      } catch (nested) {
        if (nested instanceof Error && nested.message !== "Unexpected end of JSON input") throw nested;
      }
    }
    throw error;
  }

  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function getEvidenceReviewerStatus() {
  return invokeEvidenceReview<EvidenceReviewerStatus>({ action: "status" });
}

export function listEvidenceReviewTasks(limit = 50) {
  return invokeEvidenceReview<{
    tasks: EvidenceReviewTask[];
    summary: EvidenceReviewSummary;
    role: string;
  }>({ action: "list", limit });
}

export function reviewEvidenceTask(input: {
  taskId: string;
  decision: "verified" | "rejected" | "blocked" | "reopened";
  quote?: string;
  locator?: string;
  notes?: string;
}) {
  return invokeEvidenceReview<{
    review: Record<string, unknown>;
    summary: EvidenceReviewSummary;
  }>({
    action: "review",
    taskId: input.taskId,
    decision: input.decision,
    quote: input.quote ?? "",
    locator: input.locator ?? "",
    notes: input.notes ?? "",
  });
}
