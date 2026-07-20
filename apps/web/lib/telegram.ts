import { supabase } from "./supabase";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        platform?: string;
        version?: string;
      };
    };
  }
}

export type TelegramIdentity = {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
};

export type TelegramProject = {
  id: string;
  name: string;
  region: string;
  activity: string;
  legal_form: string | null;
  land_status: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  gi_project_documents?: Array<{
    id: string;
    file_name: string;
    category: string;
    mime_type: string | null;
    byte_size: number;
    analysis_status: string;
    created_at: string;
  }>;
  gi_project_checks?: Array<{
    id: string;
    status: string;
    federal_status: string;
    regional_status: string;
    result: Record<string, unknown>;
    started_at: string;
    finished_at: string | null;
  }>;
};

const functionName = "telegram-project-api";

export function getTelegramInitData() {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData ?? "";
}

export function initializeTelegramMiniApp() {
  if (typeof window === "undefined") return;
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand();
}

export async function callTelegramApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const initData = getTelegramInitData();
  if (!initData) {
    throw new Error("Откройте приложение через Telegram-бота @stateappstartup_bot.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { action, initData, ...payload },
  });

  if (error) throw new Error(error.message || "Не удалось обратиться к Telegram API проекта");
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function authenticateTelegram() {
  return callTelegramApi<{ user: TelegramIdentity }>("authenticate");
}

export async function listTelegramProjects() {
  return callTelegramApi<{ projects: TelegramProject[] }>("list_projects");
}
