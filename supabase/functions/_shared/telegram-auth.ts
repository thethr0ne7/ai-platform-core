const MAX_AUTH_AGE_SECONDS = 86_400;
const MAX_CLOCK_SKEW_SECONDS = 30;

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  allows_write_to_pm?: boolean;
};

async function hmacSha256(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TelegramUser> {
  if (!initData) throw new Error("Telegram initData отсутствует");
  const params = new URLSearchParams(initData);
  const receivedHash = fromHex(params.get("hash") ?? "");
  if (!receivedHash) throw new Error("В Telegram initData отсутствует корректный hash");

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const calculatedHash = await hmacSha256(secretKey, dataCheckString);
  if (!constantTimeEqual(calculatedHash, receivedHash)) {
    throw new Error("Подпись Telegram недействительна");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw new Error("Telegram auth_date некорректен");
  }
  if (authDate > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    throw new Error("Telegram auth_date находится в будущем");
  }
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("Сессия Telegram устарела. Откройте Mini App заново");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram не передал пользователя");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || !user.first_name?.trim()) {
    throw new Error("Некорректные данные пользователя Telegram");
  }
  return user;
}
