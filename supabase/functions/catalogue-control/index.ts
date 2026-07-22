import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type RequestPayload = {
  action?: "status" | "list" | "run_e2e";
  initData?: string;
  projectId?: string;
  limit?: number;
};

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://ai-platform-core.vercel.app",
  "https://ai-platform-core-63-gginner.vercel.app",
  "https://web.telegram.org",
]);

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return json(request, { error: "origin_not_allowed" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    const payload = await request.json() as RequestPayload;
    const userId = await authenticateTelegram(payload.initData);
    if (!userId) return json(request, { error: "telegram_auth_failed" }, 401);

    const reviewer = await getReviewer(userId);
    const summary = await getSummary();
    const projects = await getProjects(userId);

    if (payload.action === "status") {
      return json(request, {
        authorized: Boolean(reviewer),
        role: reviewer?.role ?? null,
        summary,
        projects: reviewer ? projects : [],
      });
    }

    if (!reviewer) return json(request, { error: "catalogue_reviewer_not_allowed" }, 403);

    if (payload.action === "list") {
      const limit = Math.max(1, Math.min(Number(payload.limit ?? 100), 200));
      const { data, error } = await db.rpc("gi_list_measure_candidates", { p_limit: limit });
      if (error) throw error;
      return json(request, { candidates: data ?? [], summary, projects, role: reviewer.role });
    }

    if (payload.action === "run_e2e") {
      const projectId = String(payload.projectId ?? "");
      if (!projectId) return json(request, { error: "project_id_required" }, 400);

      const owned = projects.some((project) => project.id === projectId);
      if (!owned) return json(request, { error: "project_not_found" }, 404);

      const { data, error } = await db.rpc("gi_run_project_data_plane_e2e", {
        p_project_id: projectId,
        p_telegram_user_id: userId,
      });
      if (error) throw error;

      return json(request, {
        audit: data,
        summary: await getSummary(),
        projects,
      });
    }

    return json(request, { error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "catalogue_control_failed";
    return json(request, { error: normalizeError(message) }, 400);
  }
});

async function getReviewer(userId: number) {
  const { data, error } = await db
    .from("gi_evidence_reviewers")
    .select("telegram_user_id,role,display_name,active")
    .eq("telegram_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getProjects(userId: number) {
  const { data, error } = await db
    .from("gi_projects")
    .select("id,name,region,activity,status,updated_at")
    .eq("telegram_user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function getSummary() {
  const { data, error } = await db.rpc("gi_get_catalogue_control_summary");
  if (error) throw error;
  return data ?? emptySummary();
}

async function authenticateTelegram(initData: unknown): Promise<number | null> {
  if (typeof initData !== "string" || !initData) return null;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-project-api`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ action: "authenticate", initData }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload?.user?.id ? Number(payload.user.id) : null;
}

function emptySummary() {
  return {
    active_measures: 0,
    candidate_measures: 0,
    machine_candidates: 0,
    needs_review_candidates: 0,
    human_approved_candidates: 0,
    promoted_candidates: 0,
    verified_evidence: 0,
    verified_requirements: 0,
    latest_e2e: null,
  };
}

function normalizeError(message: string) {
  const known = [
    "catalogue_reviewer_not_allowed",
    "project_id_required",
    "project_not_found",
  ];
  return known.find((item) => message.includes(item)) ?? message;
}

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
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["access-control-allow-origin"] = origin;
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

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
