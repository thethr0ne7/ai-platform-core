import { createServer } from "node:http";
import { capabilities, products } from "./registry.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok", service: "ai-platform-core", version: "0.1.0" }));
    return;
  }

  if (request.method === "GET" && request.url === "/products") {
    response.writeHead(200);
    response.end(JSON.stringify({ products }));
    return;
  }

  if (request.method === "GET" && request.url === "/capabilities") {
    response.writeHead(200);
    response.end(JSON.stringify({ capabilities }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  console.log(`AI Platform Core listening on http://localhost:${port}`);
});
