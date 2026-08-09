const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://ai-platform-core.vercel.app",
  "https://ai-platform-core-63-gginner.vercel.app",
  "https://web.telegram.org",
]);

const PROJECT_VERCEL_ORIGIN =
  /^https:\/\/ai-platform-core(?:-[a-z0-9-]+)?-63-gginner\.vercel\.app$/;

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const configured = new Set((Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
  return DEFAULT_ALLOWED_ORIGINS.has(origin) || configured.has(origin) || PROJECT_VERCEL_ORIGIN.test(origin);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info,x-scheduler-token",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}
