import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

type BrokerAction = "claim" | "complete" | "fail";
type BrokerRequest = {
  action?: BrokerAction;
  job_id?: string;
  extracted_text?: string;
  pages?: Array<{ locator?: string; text?: string }>;
  confidence?: number;
  engine?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type GitHubClaims = JWTPayload & {
  repository?: string;
  repository_id?: string;
  repository_owner?: string;
  ref?: string;
  event_name?: string;
  workflow_ref?: string;
  job_workflow_ref?: string;
  run_id?: string;
  run_number?: string;
  run_attempt?: string;
  actor?: string;
  actor_id?: string;
  sha?: string;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "ai-platform-core-legal-ocr";
const EXPECTED_REPOSITORY = "thethr0ne7/ai-platform-core";
const EXPECTED_REPOSITORY_ID = "1305929615";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW = "thethr0ne7/ai-platform-core/.github/workflows/legal-ocr.yml@refs/heads/main";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const MAX_TEXT_LENGTH = 2_500_000;
const MAX_PAGES = 200;
const MAX_PAGE_TEXT = 120_000;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const claims = await authenticate(request);
    const body = await safeJson<BrokerRequest>(request);
    const action = body.action;
    if (!action || !["claim", "complete", "fail"].includes(action)) {
      return json({ error: "invalid_action" }, 400);
    }

    const runner = runnerMetadata(claims, body.metadata);

    if (action === "claim") {
      const { data, error } = await db.rpc("gi_claim_legal_ocr_job", { p_runner: runner });
      if (error) throw error;
      return json({ job: data ?? null });
    }

    const jobId = requireUuid(body.job_id, "job_id");

    if (action === "complete") {
      const text = String(body.extracted_text ?? "").trim();
      if (text.length < 80 || text.length > MAX_TEXT_LENGTH) {
        return json({ error: "invalid_extracted_text_length" }, 400);
      }
      const pages = sanitizePages(body.pages);
      if (!pages.length) return json({ error: "pages_required" }, 400);
      const confidence = clampNumber(body.confidence, 0, 1, 0);
      const engine = String(body.engine ?? "github-actions-ocr-v0.68").slice(0, 120);

      const { data, error } = await db.rpc("gi_complete_legal_ocr_job", {
        p_job_id: jobId,
        p_extracted_text: text,
        p_page_text: pages,
        p_confidence: confidence,
        p_engine: engine,
        p_metadata: runner,
      });
      if (error) throw error;
      return json({ result: data });
    }

    const errorText = String(body.error ?? "unknown_ocr_failure")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 1500);
    const { data, error } = await db.rpc("gi_fail_legal_ocr_job", {
      p_job_id: jobId,
      p_error: errorText,
      p_metadata: runner,
    });
    if (error) throw error;
    return json({ result: data });
  } catch (error) {
    const message = sanitizeError(error);
    const status = message.startsWith("oidc_") ? 401 : 500;
    console.error(JSON.stringify({ event: "legal_ocr_broker_error", error: message }));
    return json({ error: status === 401 ? "unauthorized" : "broker_error" }, status);
  }
});

async function authenticate(request: Request): Promise<GitHubClaims> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("oidc_missing_bearer_token");

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["RS256"],
    clockTolerance: 10,
  });
  const claims = payload as GitHubClaims;

  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error("oidc_repository_mismatch");
  if (claims.repository_id !== EXPECTED_REPOSITORY_ID) throw new Error("oidc_repository_id_mismatch");
  if (claims.ref !== EXPECTED_REF) throw new Error("oidc_ref_mismatch");
  if (!new Set(["schedule", "workflow_dispatch"]).has(String(claims.event_name ?? ""))) {
    throw new Error("oidc_event_not_allowed");
  }
  const workflow = String(claims.job_workflow_ref ?? claims.workflow_ref ?? "");
  if (workflow !== EXPECTED_WORKFLOW) throw new Error("oidc_workflow_mismatch");
  return claims;
}

function runnerMetadata(claims: GitHubClaims, supplied?: Record<string, unknown>) {
  return {
    provider: "github-actions-oidc",
    repository: claims.repository,
    repository_id: claims.repository_id,
    ref: claims.ref,
    sha: claims.sha,
    event_name: claims.event_name,
    workflow_ref: claims.job_workflow_ref ?? claims.workflow_ref,
    run_id: claims.run_id,
    run_number: claims.run_number,
    run_attempt: claims.run_attempt,
    actor: claims.actor,
    actor_id: claims.actor_id,
    supplied: supplied ?? {},
    authenticated_at: new Date().toISOString(),
  };
}

function sanitizePages(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_PAGES) return [];
  return value
    .map((page, index) => {
      if (!page || typeof page !== "object") return null;
      const item = page as Record<string, unknown>;
      const text = String(item.text ?? "").replace(/\u0000/g, "").trim().slice(0, MAX_PAGE_TEXT);
      if (text.length < 10) return null;
      const locator = String(item.locator ?? `page:${index + 1}`).trim().slice(0, 200);
      return { locator: locator || `page:${index + 1}`, text };
    })
    .filter((page): page is { locator: string; text: string } => page !== null);
}

function requireUuid(value: unknown, name: string) {
  const text = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`invalid_${name}`);
  }
  return text;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

async function safeJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1000);
}

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
