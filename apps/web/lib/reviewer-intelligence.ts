import { supabase } from "./supabase";
import { getTelegramInitData } from "./telegram";

export type IntelligenceOverview = {
  engine_version?: string;
  epistemic_contract?: Record<string, boolean>;
  totals?: Record<string, number>;
  run_statuses?: Array<Record<string, unknown>>;
  entity_types?: Array<Record<string, unknown>>;
  signal_types?: Array<Record<string, unknown>>;
  relation_types?: Array<Record<string, unknown>>;
  trajectories?: Array<Record<string, unknown>>;
  narratives?: Array<Record<string, unknown>>;
  forecasts?: Array<Record<string, unknown>>;
  decision_cards?: Array<Record<string, unknown>>;
  latest_runs?: Array<Record<string, unknown>>;
  generated_at?: string;
};

type ReviewerIntelligenceResponse = {
  overview?: IntelligenceOverview;
  reviewer?: { role?: string };
  metadata?: {
    functionVersion?: string;
    generatedAt?: string;
  };
  requestId?: string;
  error?: string;
};

export async function getReviewerIntelligenceOverview(): Promise<IntelligenceOverview> {
  const initData = getTelegramInitData();
  if (!initData) {
    throw new Error("Откройте аналитический контур через Telegram-бота @stateappstartup_bot.");
  }

  const { data, error } = await supabase.functions.invoke("reviewer-intelligence-api", {
    body: { action: "overview", initData },
  });

  if (error) {
    const code = await readFunctionError(error);
    throw new Error(toHumanMessage(code));
  }

  const payload = (data ?? {}) as ReviewerIntelligenceResponse;
  if (payload.error) throw new Error(toHumanMessage(payload.error));
  if (!payload.overview) throw new Error("Аналитическое ядро не вернуло данные.");
  return payload.overview;
}

async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context) {
    try {
      const payload = await context.clone().json() as ReviewerIntelligenceResponse;
      if (typeof payload.error === "string" && payload.error) return payload.error;
    } catch {
      // Keep the SDK fallback below.
    }
  }

  return error instanceof Error ? error.message : "reviewer_intelligence_failed";
}

function toHumanMessage(code: string): string {
  switch (code) {
    case "telegram_auth_failed":
      return "Сессия Telegram недействительна или устарела. Откройте Mini App заново.";
    case "reviewer_not_allowed":
      return "Аналитическое ядро доступно только активным экспертам платформы.";
    case "origin_not_allowed":
      return "Этот адрес приложения не разрешён для экспертного контура.";
    case "reviewer_overview_unavailable":
      return "Аналитическое ядро временно недоступно.";
    case "request_too_large":
    case "invalid_json":
    case "unknown_action":
      return "Сервер отклонил некорректный запрос.";
    default:
      return "Не удалось получить состояние аналитического ядра.";
  }
}
