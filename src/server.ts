import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { orchestrate } from "./orchestrator.js";
import { capabilities, products } from "./registry.js";
import { listActions } from "./actions.js";

const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 1_000_000;
const platformVersion = process.env.PLATFORM_VERSION ?? "0.50.0";
const platformApiKey = process.env.PLATFORM_API_KEY?.trim() ?? "";
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 60;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("Request body exceeds 1 MB");
    chunks.push(buffer);
  }

  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isExecutionRequest(value: unknown): value is {
  requestId?: string;
  productId: "proidu";
  action: string;
  payload: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.productId === "proidu" &&
    typeof candidate.action === "string" &&
    candidate.action.length > 0 &&
    "payload" in candidate &&
    (candidate.requestId === undefined || typeof candidate.requestId === "string")
  );
}

function requestKey(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return request.socket.remoteAddress ?? "unknown";
}

function withinRateLimit(request: IncomingMessage): boolean {
  const now = Date.now();
  const key = requestKey(request);
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return true;
  }
  current.count += 1;
  return current.count <= rateLimitMaxRequests;
}

function hasValidApiKey(request: IncomingMessage): boolean {
  if (!platformApiKey) return false;
  const supplied = request.headers["x-api-key"];
  if (typeof supplied !== "string") return false;
  const expectedBuffer = Buffer.from(platformApiKey);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function audit(request: IncomingMessage, status: number, startedAt: number): void {
  console.log(JSON.stringify({
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    event: "http_request",
    method: request.method,
    path: request.url,
    status,
    durationMs: Date.now() - startedAt
  }));
}

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  const url = new URL(request.url ?? "/", "http://localhost");
  let status = 200;

  try {
    if (!withinRateLimit(request)) {
      status = 429;
      send(response, status, { error: { code: "RATE_LIMITED", message: "Too many requests" } });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health/live") {
      send(response, 200, { status: "ok", service: "ai-platform-core", version: platformVersion });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health/ready") {
      const registryReady = products.length > 0 && listActions().length > 0;
      const executionConfigured = platformApiKey.length > 0;
      status = registryReady && executionConfigured ? 200 : 503;
      send(response, status, {
        status: status === 200 ? "ready" : "not-ready",
        version: platformVersion,
        checks: {
          registry: registryReady ? "ready" : "not-ready",
          execution_auth: executionConfigured ? "ready" : "not-configured"
        },
        products: products.length,
        actions: listActions().length
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/products") {
      send(response, 200, { products });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/capabilities") {
      send(response, 200, { capabilities });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/actions") {
      send(response, 200, { actions: listActions() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/execute") {
      if (!platformApiKey) {
        status = 503;
        send(response, status, { ok: false, error: { code: "EXECUTION_DISABLED", message: "PLATFORM_API_KEY is not configured" } });
        return;
      }
      if (!hasValidApiKey(request)) {
        status = 401;
        send(response, status, { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
        return;
      }

      const body = await readJson(request);
      if (!isExecutionRequest(body)) {
        status = 400;
        send(response, status, { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid execution request" } });
        return;
      }

      const result = await orchestrate(body);
      status = result.ok ? 200 : 422;
      send(response, status, result);
      return;
    }

    status = 404;
    send(response, status, { error: { code: "NOT_FOUND", message: "Not found" } });
  } catch (error) {
    status = 400;
    send(response, status, {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: error instanceof Error ? error.message : "Invalid request"
      }
    });
  } finally {
    audit(request, status, startedAt);
  }
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  server.close((error) => {
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "shutdown_failed", message: error.message }));
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port, version: platformVersion }));
});
