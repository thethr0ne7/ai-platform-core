import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return json(request, { error: "Источник запроса не разрешён" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Метод не поддерживается" }, 405);

  try {
    const body = await request.json() as { initData?: unknown; projectId?: unknown };
    const initData = typeof body.initData === "string" ? body.initData : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    if (!initData || !projectId) throw new Error("Не переданы Telegram-сессия или проект");

    const telegramUserId = await authenticateTelegram(initData);
    if (!telegramUserId) throw new Error("Telegram-аутентификация не пройдена");

    const project = await db
      .from("gi_projects")
      .select("id")
      .eq("id", projectId)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (project.error) throw project.error;
    if (!project.data) throw new Error("project_not_found");

    const latestCheck = await db
      .from("gi_project_checks")
      .select("id,result,finished_at,started_at")
      .eq("project_id", projectId)
      .eq("telegram_user_id", telegramUserId)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestCheck.error) throw latestCheck.error;
    if (!latestCheck.data?.result || typeof latestCheck.data.result !== "object") {
      throw new Error("project_report_not_found");
    }

    const report = latestCheck.data.result as Record<string, unknown>;
    const matches = Array.isArray(report.measure_matches) ? report.measure_matches : [];
    const enriched = await db.rpc("gi_enrich_measure_matches_with_directions", {
      p_project_id: projectId,
      p_telegram_user_id: telegramUserId,
      p_matches: matches,
    });
    if (enriched.error) throw enriched.error;

    const enrichedMatches = Array.isArray(enriched.data) ? enriched.data : [];
    const updatedReport = {
      ...report,
      measure_matches: enrichedMatches,
      metadata: {
        ...asRecord(report.metadata),
        measure_direction_engine: "order-187-direction-matcher-v0.75",
        measure_direction_legal_effect: "relevance_hint_only",
        measure_direction_enriched_at: new Date().toISOString(),
      },
    };

    const persisted = await db
      .from("gi_project_checks")
      .update({ result: updatedReport })
      .eq("id", latestCheck.data.id)
      .eq("telegram_user_id", telegramUserId);
    if (persisted.error) throw persisted.error;

    return json(request, {
      report: updatedReport,
      direction_summary: {
        measures: enrichedMatches.length,
        directions: enrichedMatches.reduce(
          (total: number, item: Record<string, unknown>) =>
            total + (Array.isArray(item.direction_matches) ? item.direction_matches.length : 0),
          0,
        ),
        legal_effect: "relevance_hint_only",
      },
    });
  } catch (error) {
    return json(
      request,
      { error: error instanceof Error ? error.message : "Ошибка подбора направлений расходов" },
      400,
    );
  }
});

async function authenticateTelegram(initData: string): Promise<number | null> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-project-api`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ action: "authenticate", initData }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload?.user?.id ? Number(payload.user.id) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
