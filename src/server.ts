import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { orchestrate } from "./orchestrator.js";
import { capabilities, products } from "./registry.js";
import { listActions } from "./actions.js";

const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 1_000_000;
const platformVersion = process.env.PLATFORM_VERSION ?? "0.73.0";
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
  if (typeof forwarded === "string" && forwarded.trim()) {
    const firstAddress = forwarded.split(",")[0];
    if (firstAddress) return firstAddress.trim();
  }
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
    event: "platform_http_request",
    method: request.method,
    path: request.url,
    status,
    durationMs: Date.now() - startedAt,
    remoteAddress: requestKey(request),
    occurredAt: new Date().toISOString()
  }));
}

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  let status = 500;

  try {
    if (request.method === "GET" && request.url === "/health") {
      status = 200;
      send(response, status, {
        status: "ok",
        version: platformVersion,
        products: products.map((product) => product.id),
        capabilities: capabilities.map((capability) => capability.id)
      });
      return;
    }

    if (request.method === "GET" && request.url === "/ready") {
      const ready = products.length > 0 && listActions().length > 0 && Boolean(platformApiKey);
      status = ready ? 200 : 503;
      send(response, status, {
        status: ready ? "ready" : "not_ready",
        version: platformVersion,
        checks: {
          productsRegistered: products.length > 0,
          actionsRegistered: listActions().length > 0,
          executionAuthenticationConfigured: Boolean(platformApiKey)
        }
      });
      return;
    }

    if (request.method === "GET" && request.url === "/v1/actions") {
      status = 200;
      send(response, status, { actions: listActions() });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/execute") {
      if (!withinRateLimit(request)) {
        status = 429;
        send(response, status, { error: "rate_limit_exceeded" });
        return;
      }
      if (!hasValidApiKey(request)) {
        status = 401;
        send(response, status, { error: "unauthorized" });
        return;
      }

      const body = await readJson(request);
      if (!isExecutionRequest(body)) {
        status = 400;
        send(response, status, { error: "invalid_execution_request" });
        return;
      }

      const result = await orchestrate({
        requestId: body.requestId,
        productId: body.productId,
        action: body.action,
        payload: body.payload
      });
      status = result.status === "completed" ? 200 : result.status === "denied" ? 403 : 400;
      send(response, status, result);
      return;
    }

    status = 404;
    send(response, status, { error: "not_found" });
  } catch (error) {
    status = 500;
    send(response, status, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    audit(request, status, startedAt);
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "platform_server_started",
    port,
    version: platformVersion,
    executionEnabled: Boolean(platformApiKey),
    occurredAt: new Date().toISOString()
  }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: "info", event: "platform_server_shutdown", signal }));
  server.close((error) => {
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
