import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Метод не поддерживается" }, 405);

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
    const eligibility = await db.rpc("gi_evaluate_project_measures", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_check_id: checkId,
    });
    if (eligibility.error) throw eligibility.error;

    const enrichedReport = await db.rpc("gi_enrich_project_report", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_base_report: baseReport.data,
    });
    if (enrichedReport.error) throw enrichedReport.error;

    const deterministicMatches = Array.isArray(eligibility.data) ? eligibility.data : [];
    const bestMatchScore = deterministicMatches.reduce(
      (best: number, item: Record<string, unknown>) => Math.max(best, Number(item.score ?? 0)),
      0,
    );
    const enrichedData = (enrichedReport.data ?? {}) as Record<string, unknown>;
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

    const sourceCatalog = await db.rpc("gi_get_source_catalog_for_report");
    if (sourceCatalog.error) throw sourceCatalog.error;

    const finalData = finalizedReport.data as Record<string, unknown>;
    const report = {
      ...finalData,
      sources: sourceCatalog.data ?? [],
      metadata: {
        ...((finalData?.metadata as Record<string, unknown>) ?? {}),
        source_health_engine: "official-source-ingestion-v0.59",
        truth_gate_engine: "measure-scoped-truth-gate-v0.64",
        eligibility_engine: "deterministic-eligibility-v0.62",
        report_finalizer: "project-report-finalizer-v0.63",
        source_catalog_generated_at: new Date().toISOString(),
      },
    };

    return jsonResponse({ report });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ошибка анализа" },
      400,
    );
  }
});
