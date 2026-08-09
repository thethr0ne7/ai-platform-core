import assert from "node:assert/strict";
import test from "node:test";

import { validateTelegramInitData } from "../supabase/functions/_shared/telegram-auth.ts";

const botToken = "123456:test-token-for-local-validation";
const now = 1_786_252_400;

async function signInitData(authDate: number): Promise<string> {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAEAA-test",
    user: JSON.stringify({ id: 42, first_name: "Тест", username: "test_user" }),
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = new Uint8Array(await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken)));
  const signingKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", signingKey, encoder.encode(dataCheckString)),
  );
  params.set("hash", Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  return params.toString();
}

test("accepts correctly signed fresh Telegram initData", async () => {
  const user = await validateTelegramInitData(await signInitData(now - 10), botToken, now);
  assert.equal(user.id, 42);
});

test("rejects a modified Telegram signature", async () => {
  const initData = `${await signInitData(now - 10)}x`;
  await assert.rejects(validateTelegramInitData(initData, botToken, now), /hash|недействительна/);
});

test("rejects expired Telegram initData", async () => {
  await assert.rejects(validateTelegramInitData(await signInitData(now - 86_401), botToken, now), /устарела/);
});

test("rejects Telegram initData dated in the future", async () => {
  await assert.rejects(validateTelegramInitData(await signInitData(now + 31), botToken, now), /будущем/);
});
