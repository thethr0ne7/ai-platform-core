import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const RUNNER = new URL("./run.ts", import.meta.url);
const FORBIDDEN_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
const FORBIDDEN_SQL = ["insert ", "update ", "delete ", "upsert", "truncate ", "alter ", "drop ", "create "] as const;

test("interaction probe runner exposes no write-capable HTTP method", async () => {
  const source = (await readFile(RUNNER, "utf8")).toLowerCase();

  for (const method of FORBIDDEN_METHODS) {
    assert.equal(
      source.includes(`method: \"${method.toLowerCase()}\"`) || source.includes(`method: '${method.toLowerCase()}'`),
      false,
      `forbidden HTTP method detected: ${method}`,
    );
  }
});

test("interaction probe runner contains no mutation SQL vocabulary", async () => {
  const source = (await readFile(RUNNER, "utf8")).toLowerCase();

  for (const token of FORBIDDEN_SQL) {
    assert.equal(source.includes(token), false, `forbidden SQL token detected: ${token.trim()}`);
  }
});

test("interaction probe runner publishes an explicit read-only contract", async () => {
  const source = await readFile(RUNNER, "utf8");
  assert.match(source, /allowed_http_methods:\s*\["GET",\s*"HEAD",\s*"OPTIONS"\]/);
  assert.match(source, /writes_performed:\s*false/);
});
