import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type ReviewDecision = "verified" | "rejected" | "blocked" | "reopened";

type RequestPayload = {
  action?: "status" | "list" | "review";
  initData?: string;
  taskId?: string;
  decision?: ReviewDecision;
  quote?: string;
  locator?: string;
  notes?: string;
  limit?: number;
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization,apikey,x-client-info",
  "access-control-allow-methods": "POST,OPTIONS",
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = await request.json() as RequestPayload;
    const userId = await authenticateTelegram(payload.initData);
    if (!userId) return json({ error: "telegram_auth_failed" }, 401);

    const reviewer = await getReviewer(userId);
    if (payload.action === "status") {
      if (!reviewer) return json({ authorized: false, role: null, summary: emptySummary() });
      return json({ authorized: true, role: reviewer.role, summary: await getSummary() });
    }

    if (!reviewer) return json({ error: "evidence_reviewer_not_allowed" }, 403);

    if (payload.action === "list") {
      const limit = Math.max(1, Math.min(Number(payload.limit ?? 50), 100));
      const { data, error } = await db.rpc("gi_list_evidence_review_tasks", {
        p_reviewer_telegram_id: userId,
        p_limit: limit,
      });
      if (error) throw error;
      return json({ tasks: data ?? [], summary: await getSummary(), role: reviewer.role });
    }

    if (payload.action === "review") {
      const taskId = String(payload.taskId ?? "");
      const decision = payload.decision;
      if (!taskId || !decision || !["verified", "rejected", "blocked", "reopened"].includes(decision)) {
        return json({ error: "invalid_evidence_review_request" }, 400);
      }

      if (decision === "verified") {
        if (String(payload.quote ?? "").trim().length < 40) {
          return json({ error: "verification_requires_exact_quote" }, 400);
        }
        if (String(payload.locator ?? "").trim().length < 8) {
          return json({ error: "verification_requires_locator" }, 400);
        }
      }

      const { data, error } = await db.rpc("gi_review_evidence_task", {
        p_task_id: taskId,
        p_reviewer_telegram_id: userId,
        p_decision: decision,
        p_quote: String(payload.quote ?? "") || null,
        p_locator: String(payload.locator ?? "") || null,
        p_notes: String(payload.notes ?? "") || null,
      });
      if (error) throw error;
      return json({ review: data, summary: await getSummary() });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "evidence_review_failed";
    return json({ error: normalizeError(message) }, 400);
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

async function getSummary() {
  const [tasks, humanEvidence, machineMatches, requirements] = await Promise.all([
    db.from("gi_evidence_verification_queue").select("status"),
    db
      .from("gi_evidence_records")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "verified")
      .contains("metadata", { human_reviewed: true }),
    db
      .from("gi_evidence_records")
      .select("id", { count: "exact", head: true })
      .contains("metadata", { machine_quote_match: true }),
    db
      .from("gi_measure_requirements")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("evidence_status", "verified"),
  ]);
  if (tasks.error) throw tasks.error;
  if (humanEvidence.error) throw humanEvidence.error;
  if (machineMatches.error) throw machineMatches.error;
  if (requirements.error) throw requirements.error;

  const summary = emptySummary();
  for (const row of tasks.data ?? []) {
    const status = String(row.status);
    if (status === "verified") summary.verifiedTasks += 1;
    else if (status === "blocked") summary.blockedTasks += 1;
    else if (status === "rejected") summary.rejectedTasks += 1;
    else summary.openTasks += 1;
  }
  summary.machineMatches = machineMatches.count ?? 0;
  summary.verifiedEvidence = humanEvidence.count ?? 0;
  summary.verifiedRequirements = requirements.count ?? 0;
  return summary;
}

function emptySummary() {
  return {
    openTasks: 0,
    verifiedTasks: 0,
    blockedTasks: 0,
    rejectedTasks: 0,
    machineMatches: 0,
    verifiedEvidence: 0,
    verifiedRequirements: 0,
  };
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

function normalizeError(message: string) {
  const known = [
    "evidence_reviewer_not_allowed",
    "evidence_review_task_not_found",
    "invalid_evidence_review_decision",
    "only_requirement_quote_tasks_can_verify_evidence",
    "verification_requires_tier_a_document",
    "verification_requires_verified_source_owner",
    "verification_requires_extracted_source_version",
    "verification_requires_exact_quote",
    "verification_requires_locator",
    "quote_not_found_in_source_version",
    "verified_evidence_requires_human_review",
    "verified_requirement_requires_human_reviewed_evidence",
  ];
  return known.find((item) => message.includes(item)) ?? message;
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
