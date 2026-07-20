import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hgivyjjethjwswjrvroy.supabase.co";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3XDHXvXvsGBUjY8rMt5Efw_sJKyq3RV";

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const { data: anonymousData, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Не удалось создать защищённую сессию: ${error.message}`);
  if (!anonymousData.session) throw new Error("Supabase не вернул пользовательскую сессию.");
  return anonymousData.session;
}
