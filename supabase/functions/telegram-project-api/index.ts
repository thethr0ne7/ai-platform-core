import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://ai-platform-core.vercel.app",
  "https://ai-platform-core-63-gginner.vercel.app",
  "https://web.telegram.org",
]);

const PROJECT_VERCEL_ORIGIN = /^https:\/\/ai-platform-core(?:-[a-z0-9-]+)?-63-gginner\.vercel\.app$/;
const DOCUMENT_BUCKET = "gi-project-documents";
const DOWNLOAD_URL_TTL_SECONDS = 300;

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  allows_write_to_pm?: boolean;
};

async function hmacSha256(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateTelegramInitData(initData: string, botToken: string): Promise<TelegramUser> {
  if (!initData) throw new Error("Telegram initData отсутствует");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("В Telegram initData отсутствует hash");

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const calculatedHash = toHex(await hmacSha256(secretKey, dataCheckString));
  if (calculatedHash !== receivedHash) throw new Error("Подпись Telegram недействительна");

  const authDate = Number(params.get("auth_date") ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400) throw new Error("Сессия Telegram устарела. Откройте Mini App заново");

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram не передал пользователя");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!user.id || !user.first_name) throw new Error("Некорректные данные пользователя Telegram");
  return user;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "_").slice(0, 180);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return json(req, { error: "origin_not_allowed" }, 403);
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Метод не поддерживается" }, 405);

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!botToken) return json(req, { error: "На сервере не задан TELEGRAM_BOT_TOKEN" }, 503);
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Supabase environment не настроен" }, 503);

    const payload = await req.json();
    const action = String(payload.action ?? "");
    const user = await validateTelegramInitData(String(payload.initData ?? ""), botToken);
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { error: profileError } = await supabase.from("gi_telegram_profiles").upsert({
      telegram_user_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      language_code: user.language_code ?? null,
      photo_url: user.photo_url ?? null,
      allows_write_to_pm: Boolean(user.allows_write_to_pm),
      last_login_at: new Date().toISOString(),
    }, { onConflict: "telegram_user_id" });
    if (profileError) throw profileError;

    if (action === "authenticate") {
      return json(req, {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name ?? null,
          username: user.username ?? null,
          photoUrl: user.photo_url ?? null,
        },
      });
    }

    if (action === "list_projects") {
      const { data, error } = await supabase
        .from("gi_projects")
        .select("id,name,region,activity,legal_form,land_status,status,created_at,updated_at,gi_project_documents(id,file_name,category,mime_type,byte_size,analysis_status,created_at),gi_project_checks(id,status,federal_status,regional_status,result,started_at,finished_at)")
        .eq("telegram_user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json(req, { projects: data ?? [] });
    }

    if (action === "save_project") {
      const project = payload.project ?? {};
      if (!String(project.name ?? "").trim()) return json(req, { error: "Укажите название проекта" }, 400);
      const record = {
        telegram_user_id: user.id,
        name: String(project.name).trim(),
        region: String(project.region ?? "").trim(),
        activity: String(project.activity ?? "").trim(),
        legal_form: project.legalForm ? String(project.legalForm) : null,
        land_status: project.landStatus ? String(project.landStatus) : null,
        status: String(project.status ?? "draft"),
        updated_at: new Date().toISOString(),
      };
      if (project.id) {
        const { data, error } = await supabase.from("gi_projects")
          .update(record)
          .eq("id", String(project.id))
          .eq("telegram_user_id", user.id)
          .select("*")
          .single();
        if (error) throw error;
        return json(req, { project: data });
      }
      const { data, error } = await supabase.from("gi_projects").insert(record).select("*").single();
      if (error) throw error;
      return json(req, { project: data });
    }

    if (action === "create_upload_url") {
      const projectId = String(payload.projectId ?? "");
      const fileName = String(payload.fileName ?? "");
      if (!projectId || !fileName) return json(req, { error: "Не указан проект или файл" }, 400);
      const { data: owned, error: ownedError } = await supabase.from("gi_projects")
        .select("id")
        .eq("id", projectId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return json(req, { error: "Проект не найден" }, 404);
      const path = `${user.id}/${projectId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
      const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return json(req, { path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === "create_download_url") {
      const documentId = String(payload.documentId ?? "");
      if (!documentId) return json(req, { error: "Не указан документ" }, 400);
      const { data: document, error: documentError } = await supabase.from("gi_project_documents")
        .select("id,storage_path,file_name,mime_type")
        .eq("id", documentId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document?.storage_path) return json(req, { error: "Документ не найден" }, 404);

      const { data, error } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(document.storage_path, DOWNLOAD_URL_TTL_SECONDS, {
          download: document.file_name || true,
        });
      if (error) throw error;
      return json(req, {
        url: data.signedUrl,
        expiresIn: DOWNLOAD_URL_TTL_SECONDS,
        fileName: document.file_name,
        mimeType: document.mime_type,
      });
    }

    if (action === "register_document") {
      const row = payload.document ?? {};
      const projectId = String(row.projectId ?? "");
      const storagePath = String(row.storagePath ?? "");
      const { data: owned } = await supabase.from("gi_projects").select("id")
        .eq("id", projectId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();
      if (!owned) return json(req, { error: "Проект не найден" }, 404);
      if (!storagePath.startsWith(`${user.id}/${projectId}/`)) {
        return json(req, { error: "Некорректный путь документа" }, 400);
      }
      const { data, error } = await supabase.from("gi_project_documents").insert({
        project_id: projectId,
        telegram_user_id: user.id,
        category: String(row.category ?? "Другое"),
        file_name: String(row.fileName ?? "Файл"),
        storage_path: storagePath,
        mime_type: row.mimeType ? String(row.mimeType) : null,
        byte_size: Number(row.byteSize ?? 0),
      }).select("*").single();
      if (error) throw error;
      return json(req, { document: data });
    }

    if (action === "delete_document") {
      const documentId = String(payload.documentId ?? "");
      const { data: document, error: documentError } = await supabase.from("gi_project_documents")
        .select("id,storage_path")
        .eq("id", documentId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document) return json(req, { error: "Документ не найден" }, 404);
      const storageResult = await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);
      if (storageResult.error) throw storageResult.error;
      const { error } = await supabase.from("gi_project_documents").delete().eq("id", documentId).eq("telegram_user_id", user.id);
      if (error) throw error;
      return json(req, { success: true });
    }

    if (action === "run_check") {
      const projectId = String(payload.projectId ?? "");
      const { data: project } = await supabase.from("gi_projects").select("id")
        .eq("id", projectId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();
      if (!project) return json(req, { error: "Проект не найден" }, 404);
      const startedAt = new Date().toISOString();
      const { count } = await supabase.from("gi_project_documents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("telegram_user_id", user.id);
      const result = {
        documents_count: count ?? 0,
        federal_registry: "available_internal_registry",
        regional_sources: "not_connected",
        next_action: "Подключить региональный официальный источник",
      };
      const { data, error } = await supabase.from("gi_project_checks").insert({
        project_id: projectId,
        telegram_user_id: user.id,
        status: "partial",
        federal_status: "checked",
        regional_status: "not_connected",
        result,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw error;
      await supabase.from("gi_projects").update({ status: "needs_data", updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("telegram_user_id", user.id);
      return json(req, { check: data });
    }

    return json(req, { error: "Неизвестное действие" }, 400);
  } catch (error) {
    console.error(error);
    return json(req, { error: error instanceof Error ? error.message : "Внутренняя ошибка" }, 400);
  }
});

function configuredOrigins(): Set<string> {
  return new Set((Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
}

function isAllowedOrigin(origin: string): boolean {
  return DEFAULT_ALLOWED_ORIGINS.has(origin)
    || configuredOrigins().has(origin)
    || PROJECT_VERCEL_ORIGIN.test(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-headers": "content-type,authorization,apikey,x-client-info",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
