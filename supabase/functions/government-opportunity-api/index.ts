import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  analyzePreTruthIntelligence,
  finalizeGovernmentIntelligence,
} from "../_shared/intelligence/index.ts";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://ai-platform-core.vercel.app",
  "https://ai-platform-core-63-gginner.vercel.app",
  "https://web.telegram.org",
]);

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse(req, { error: "Источник запроса не разрешён" }, 403);
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Метод не поддерживается" }, 405);

  try {
    const body = await req.json();
    const initData = String(body.initData ?? "");
    const projectId = String(body.projectId ?? "");
    if (!initData || !projectId) throw new Error("Не переданы Telegram-сессия или проект");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Supabase environment не настроен");

    const authResponse = await fetch(`${supabaseUrl}/functions/v1/telegram-project-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ action: "authenticate", initData }),
    });
    const authPayload = await authResponse.json();
    if (!authResponse.ok || !authPayload?.user?.id) {
      throw new Error(authPayload?.error ?? "Telegram-аутентификация не пройдена");
    }

    const telegramUserId = Number(authPayload.user.id);
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const baseReport = await db.rpc("gi_build_project_report", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
    });
    if (baseReport.error) throw baseReport.error;

    const checkId = typeof baseReport.data?.check_id === "string" ? baseReport.data.check_id : null;

    const enrichedReport = await db.rpc("gi_enrich_project_report", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_base_report: baseReport.data,
    });
    if (enrichedReport.error) throw enrichedReport.error;

    const sourceCatalog = await db.rpc("gi_get_source_catalog_for_report");
    if (sourceCatalog.error) throw sourceCatalog.error;

    const enrichedData = (enrichedReport.data ?? {}) as Record<string, unknown>;
    const preTruthIntelligence = analyzePreTruthIntelligence({
      projectId,
      ...(checkId ? { projectCheckId: checkId } : {}),
      report: {
        ...enrichedData,
        sources: sourceCatalog.data ?? [],
      },
    });

    const eligibility = await db.rpc("gi_evaluate_project_measures", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_check_id: checkId,
    });
    if (eligibility.error) throw eligibility.error;

    const deterministicMatches = Array.isArray(eligibility.data) ? eligibility.data : [];
    const bestMatchScore = deterministicMatches.reduce(
      (best: number, item: Record<string, unknown>) => Math.max(best, Number(item.score ?? 0)),
      0,
    );
    const reportForTruth = {
      ...enrichedData,
      measure_matches: deterministicMatches,
      readiness: {
        ...((enrichedData.readiness as Record<string, unknown> | undefined) ?? {}),
        matches_total: deterministicMatches.length,
        best_match_score: bestMatchScore,
      },
    };

    const truthReport = await db.rpc("gi_apply_measure_scoped_truth_gate", {
      p_report: reportForTruth,
    });
    if (truthReport.error) throw truthReport.error;

    const finalizedReport = await db.rpc("gi_finalize_project_report", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_report: truthReport.data,
    });
    if (finalizedReport.error) throw finalizedReport.error;

    const finalData = finalizedReport.data as Record<string, unknown>;
    const coreReport = {
      ...finalData,
      sources: sourceCatalog.data ?? [],
      metadata: {
        ...((finalData?.metadata as Record<string, unknown>) ?? {}),
        source_health_engine: "official-source-ingestion-v0.59",
        truth_gate_engine: "measure-scoped-truth-gate-v0.64",
        eligibility_engine: "deterministic-eligibility-v0.70",
        report_finalizer: "project-report-finalizer-v0.63",
        persistence_engine: "final-report-persistence-v0.71",
        intelligence_engine: "ver436sia-intelligence-v0.72",
        source_catalog_generated_at: new Date().toISOString(),
      },
    };

    let intelligenceStatus: Record<string, unknown>;
    try {
      const intelligenceBundle = finalizeGovernmentIntelligence({
        projectId,
        ...(checkId ? { projectCheckId: checkId } : {}),
        finalReport: coreReport,
        preTruth: preTruthIntelligence,
      });
      const persistedIntelligence = await db.rpc("gi_persist_intelligence_bundle", {
        p_project_id: projectId,
        p_telegram_user_id: telegramUserId,
        p_check_id: checkId,
        p_bundle: intelligenceBundle,
      });
      if (persistedIntelligence.error) throw persistedIntelligence.error;

      intelligenceStatus = {
        status: persistedIntelligence.data?.status ?? "manual_review",
        run_id: persistedIntelligence.data?.run_id ?? null,
        engine_version: intelligenceBundle.engineVersion,
        epistemic_contract: {
          signal_is_fact: false,
          trend_is_requirement: false,
          forecast_is_eligibility: false,
          narrative_is_legal_basis: false,
        },
        summary: intelligenceBundle.summary,
        decision_cards: intelligenceBundle.decisionCards,
        trajectories: intelligenceBundle.trajectories,
        narratives: intelligenceBundle.narratives,
        forecasts: intelligenceBundle.forecasts,
      };
    } catch (intelligenceError) {
      console.error("government_intelligence_failed", intelligenceError);
      intelligenceStatus = {
        status: "failed",
        engine_version: "ver436sia-intelligence-v0.72",
        error: intelligenceError instanceof Error ? intelligenceError.message : "Ошибка аналитического контура",
        publishable_decision_cards: 0,
      };
    }

    const report = {
      ...coreReport,
      government_intelligence: intelligenceStatus,
      metadata: {
        ...coreReport.metadata,
        intelligence_status: intelligenceStatus.status,
      },
    };

    if (checkId) {
      const persisted = await db
        .from("gi_project_checks")
        .update({ result: report })
        .eq("id", checkId)
        .eq("telegram_user_id", telegramUserId);
      if (persisted.error) throw persisted.error;
    }

    return jsonResponse(req, { report });
  } catch (error) {
    return jsonResponse(
      req,
      { error: error instanceof Error ? error.message : "Ошибка анализа" },
      400,
    );
  }
});
