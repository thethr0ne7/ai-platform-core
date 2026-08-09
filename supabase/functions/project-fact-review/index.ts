import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";

type RequestPayload = {
  action?: "list" | "review" | "summary";
  initData?: string;
  projectId?: string;
  candidateId?: string;
  decision?: "confirmed" | "rejected";
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (!isAllowedOrigin(request.headers.get("origin"))) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  try {
    const payload = await request.json() as RequestPayload;
    const userId = await authenticateTelegram(payload.initData);
    if (!userId) return json(request, { error: "telegram_auth_failed" }, 401);

    if (payload.action === "list") {
      const projectId = String(payload.projectId ?? "");
      await assertProjectOwner(projectId, userId);
      const { data, error } = await db
        .from("gi_project_fact_candidates")
        .select("id,project_id,document_id,fact_code,fact_label,fact_type,value,quote,locator,confidence,status,created_at,gi_project_documents(file_name,category,analysis_status)")
        .eq("project_id", projectId)
        .eq("telegram_user_id", userId)
        .order("status", { ascending: true })
        .order("confidence", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json(request, { candidates: data ?? [] });
    }

    if (payload.action === "summary") {
      const projectId = String(payload.projectId ?? "");
      await assertProjectOwner(projectId, userId);
      const { data, error } = await db
        .from("gi_project_fact_candidates")
        .select("status")
        .eq("project_id", projectId)
        .eq("telegram_user_id", userId);
      if (error) throw error;
      const summary = { pending_confirmation: 0, confirmed: 0, rejected: 0 };
      for (const row of data ?? []) {
        const status = String(row.status) as keyof typeof summary;
        if (status in summary) summary[status] += 1;
      }
      return json(request, { summary });
    }

    if (payload.action === "review") {
      const candidateId = String(payload.candidateId ?? "");
      const decision = payload.decision;
      if (!candidateId || !decision || !["confirmed", "rejected"].includes(decision)) {
        return json(request, { error: "invalid_review_request" }, 400);
      }
      const { data, error } = await db.rpc("gi_review_project_fact_candidate", {
        p_candidate_id: candidateId,
        p_telegram_user_id: userId,
        p_decision: decision,
      });
      if (error) throw error;
      return json(request, { review: data });
    }

    return json(request, { error: "unknown_action" }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "fact_review_failed" }, 400);
  }
});

async function assertProjectOwner(projectId: string, userId: number) {
  if (!projectId) throw new Error("project_id_required");
  const { data, error } = await db
    .from("gi_projects")
    .select("id")
    .eq("id", projectId)
    .eq("telegram_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("project_not_found");
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

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
