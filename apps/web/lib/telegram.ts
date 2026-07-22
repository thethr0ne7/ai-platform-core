import { supabase } from "./supabase";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        platform?: string;
        version?: string;
      };
    };
  }
}

export type TelegramIdentity = {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
};

export type TelegramProjectDocument = {
  id: string;
  file_name: string;
  category: string;
  mime_type: string | null;
  byte_size: number;
  analysis_status: string;
  created_at: string;
};

export type TelegramProject = {
  id: string;
  name: string;
  region: string;
  activity: string;
  legal_form: string | null;
  land_status: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  gi_project_documents?: TelegramProjectDocument[];
  gi_project_checks?: Array<{
    id: string;
    status: string;
    federal_status: string;
    regional_status: string;
    result: Record<string, unknown>;
    started_at: string;
    finished_at: string | null;
  }>;
};

export type ProjectFactCandidate = {
  id: string;
  project_id: string;
  document_id: string;
  fact_code: string;
  fact_label: string;
  fact_type: string;
  value: Record<string, unknown>;
  quote: string;
  locator: string;
  confidence: number;
  status: "pending_confirmation" | "confirmed" | "rejected";
  created_at: string;
  gi_project_documents?: {
    file_name?: string;
    category?: string;
    analysis_status?: string;
  } | null;
};

export type ProjectFactReviewSummary = {
  pending_confirmation: number;
  confirmed: number;
  rejected: number;
};

const functionName = "telegram-project-api";

export function getTelegramInitData() {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData ?? "";
}

export function initializeTelegramMiniApp() {
  if (typeof window === "undefined") return;
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand();
}

async function readFunctionError(error: unknown) {
  const fallback = error instanceof Error
    ? error.message
    : "Не удалось обратиться к Telegram API проекта";

  const context = (error as { context?: Response } | null)?.context;
  if (!context) return fallback;

  try {
    const body = await context.clone().json() as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    try {
      const responseText = await context.clone().text();
      if (responseText.trim()) return responseText;
    } catch {
      // Keep the original SDK error.
    }
  }

  return fallback;
}

async function invokeTelegramFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) throw new Error("Откройте приложение через Telegram-бота @stateappstartup_bot.");

  const { data, error } = await supabase.functions.invoke(name, {
    body: { initData, ...body },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function callTelegramApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return invokeTelegramFunction<T>(functionName, { action, ...payload });
}

export async function callGovernmentOpportunityApi<T>(projectId: string): Promise<T> {
  const base = await invokeTelegramFunction<{ report?: Record<string, unknown> } & Record<string, unknown>>(
    "government-opportunity-api",
    { projectId },
  );

  if (!base.report) return base as T;

  try {
    const enriched = await invokeTelegramFunction<{ report: Record<string, unknown> }>(
      "measure-direction-enrichment",
      { projectId },
    );
    return { ...base, report: enriched.report } as T;
  } catch (error) {
    console.warn("measure_direction_enrichment_unavailable", error);
    const metadata = base.report.metadata && typeof base.report.metadata === "object"
      ? base.report.metadata as Record<string, unknown>
      : {};
    return {
      ...base,
      report: {
        ...base.report,
        metadata: {
          ...metadata,
          measure_direction_status: "unavailable",
          measure_direction_legal_effect: "relevance_hint_only",
        },
      },
    } as T;
  }
}

export async function requestDocumentProcessing(documentId: string) {
  return invokeTelegramFunction<{ accepted: boolean; background: boolean; documentId: string }>(
    "project-document-processor",
    { documentId },
  );
}

export async function listProjectFactCandidates(projectId: string) {
  return invokeTelegramFunction<{ candidates: ProjectFactCandidate[] }>(
    "project-fact-review",
    { action: "list", projectId },
  );
}

export async function getProjectFactReviewSummary(projectId: string) {
  return invokeTelegramFunction<{ summary: ProjectFactReviewSummary }>(
    "project-fact-review",
    { action: "summary", projectId },
  );
}

export async function reviewProjectFactCandidate(
  candidateId: string,
  decision: "confirmed" | "rejected",
) {
  return invokeTelegramFunction<{ review: Record<string, unknown> }>(
    "project-fact-review",
    { action: "review", candidateId, decision },
  );
}

export async function authenticateTelegram() {
  return callTelegramApi<{ user: TelegramIdentity }>("authenticate");
}

export async function listTelegramProjects() {
  return callTelegramApi<{ projects: TelegramProject[] }>("list_projects");
}
