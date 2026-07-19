import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { orchestrate } from "./orchestrator.js";
import { capabilities, products } from "./registry.js";
import { listActions } from "./actions.js";

const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 1_000_000;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new Error("Request body exceeds 1 MB");
    }
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
    typeof candidate.productId === "string" &&
    typeof candidate.action === "string" &&
    candidate.action.length > 0 &&
    "payload" in candidate &&
    (candidate.requestId === undefined || typeof candidate.requestId === "string")
  );
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health/live") {
    send(response, 200, { status: "ok", service: "ai-platform-core", version: "0.2.0" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health/ready") {
    send(response, 200, {
      status: products.length > 0 && listActions().length > 0 ? "ready" : "not-ready",
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
    try {
      const body = await readJson(request);
      if (!isExecutionRequest(body)) {
        send(response, 400, {
          ok: false,
          error: { code: "INVALID_REQUEST", message: "Invalid execution request" }
        });
        return;
      }

      const result = await orchestrate(body);
      send(response, result.ok ? 200 : 422, result);
    } catch (error) {
      send(response, 400, {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: error instanceof Error ? error.message : "Invalid request"
        }
      });
    }
    return;
  }

  send(response, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
});

server.listen(port, () => {
  console.log(`AI Platform Core listening on http://localhost:${port}`);
});
