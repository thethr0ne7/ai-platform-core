import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type RequestPayload = {
  action?: "overview";
  initData?: string;
};

type Reviewer = {
  telegram_user_id: number;
  role: string;
  display_name: string | null;
  active: boolean;
};

const FUNCTION_VERSION = "reviewer-intelligence-api-v1";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_INIT_DATA_BYTES = 16 * 1024;
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
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");

  if (origin && !isAllowedOrigin(origin)) {
    log("warn", "origin_rejected", { requestId, origin });
    return json(request, { error: "origin_not_allowed", requestId }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "method_not_allowed", requestId }, 405);
  }

  try {
    const payload = await readPayload(request);
    if (payload.action !== "overview") {
      return json(request, { error: "unknown_action", requestId }, 400);
    }

    const initData = String(payload.initData ?? "");
    if (!initData || new TextEncoder().encode(initData).byteLength > MAX_INIT_DATA_BYTES) {
      return json(request, { error: "telegram_auth_failed", requestId }, 401);
    }

    const userId = await authenticateTelegram(initData, requestId);
    if (!userId) {
      return json(request, { error: "telegram_auth_failed", requestId }, 401);
    }

    const reviewer = await getReviewer(userId);
    if (!reviewer) {
      log("warn", "reviewer_denied", { requestId, telegramUserId: userId });
      return json(request, { error: "reviewer_not_allowed", requestId }, 403);
    }

    const { data, error } = await db.rpc("get_government_intelligence_overview");
    if (error) {
      log("error", "overview_rpc_failed", {
        requestId,
        telegramUserId: userId,
        code: error.code,
      });
      return json(request, { error: "reviewer_overview_unavailable", requestId }, 503);
    }

    const overview = boundOverview(data);
    log("info", "overview_served", {
      requestId,
      telegramUserId: userId,
      reviewerRole: reviewer.role,
    });

    return json(request, {
      overview,
      reviewer: { role: reviewer.role },
      metadata: {
        functionVersion: FUNCTION_VERSION,
        generatedAt: new Date().toISOString(),
      },
      requestId,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return json(request, { error: error.code, requestId }, error.status);
    }

    log("error", "unexpected_failure", {
      requestId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return json(request, { error: "reviewer_intelligence_failed", requestId }, 500);
  }
});

async function readPayload(request: Request): Promise<RequestPayload> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestError("request_too_large", 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new RequestError("request_too_large", 413);
  }

  try {
    return JSON.parse(raw) as RequestPayload;
  } catch {
    throw new RequestError("invalid_json", 400);
  }
}

async function authenticateTelegram(initData: string, requestId: string): Promise<number | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-project-api`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ action: "authenticate", initData }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.user?.id) {
      log("warn", "telegram_auth_rejected", { requestId, upstreamStatus: response.status });
      return null;
    }

    return Number(payload.user.id);
  } catch (error) {
    log("error", "telegram_auth_unavailable", {
      requestId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

async function getReviewer(userId: number): Promise<Reviewer | null> {
  const { data, error } = await db
    .from("gi_evidence_reviewers")
    .select("telegram_user_id,role,display_name,active")
    .eq("telegram_user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data as Reviewer | null;
}

function boundOverview(input: unknown): Record<string, unknown> {
  const source = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};

  return {
    engine_version: source.engine_version,
    epistemic_contract: boundedObject(source.epistemic_contract, 30),
    totals: boundedObject(source.totals, 50),
    run_statuses: boundedArray(source.run_statuses, 50),
    entity_types: boundedArray(source.entity_types, 50),
    signal_types: boundedArray(source.signal_types, 50),
    relation_types: boundedArray(source.relation_types, 50),
    trajectories: boundedArray(source.trajectories, 100),
    narratives: boundedArray(source.narratives, 100),
    forecasts: boundedArray(source.forecasts, 100),
    decision_cards: boundedArray(source.decision_cards, 100),
    latest_runs: boundedArray(source.latest_runs, 50),
    generated_at: source.generated_at,
  };
}

function boundedArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function boundedObject(value: unknown, limit: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, limit));
}

function configuredOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin: string): boolean {
  if (configuredOrigins().has(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === "https:"
      && url.hostname.startsWith("ai-platform-core-")
      && url.hostname.endsWith("-63-gginner.vercel.app");
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
  }

  return headers;
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    function: FUNCTION_VERSION,
    timestamp: new Date().toISOString(),
    ...fields,
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

class RequestError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}
