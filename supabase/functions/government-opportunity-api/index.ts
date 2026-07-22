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
    headers: { ...cors, "Content-Type": "application/json" },
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

    const enrichedReport = await db.rpc("gi_enrich_project_report", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_base_report: baseReport.data,
    });
    if (enrichedReport.error) throw enrichedReport.error;

    return jsonResponse({ report: enrichedReport.data });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Ошибка анализа" },
      400,
    );
  }
});
