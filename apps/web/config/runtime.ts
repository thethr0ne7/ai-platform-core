export const runtimeConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export function validateRuntimeConfig(){
  return Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);
}
