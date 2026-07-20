"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileUp,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  authenticateTelegram,
  callTelegramApi,
  initializeTelegramMiniApp,
  listTelegramProjects,
  type TelegramIdentity,
  type TelegramProject,
} from "../lib/telegram";

type DraftDocument = {
  id: string;
  file: File;
  category: string;
  uploaded: boolean;
};

type ProjectDraft = {
  id?: string;
  name: string;
  region: string;
  activity: string;
  legalForm: string;
  landStatus: string;
};

const emptyProject: ProjectDraft = {
  name: "",
  region: "Кабардино-Балкарская Республика",
  activity: "Агросервис и сельский туризм",
  legalForm: "",
  landStatus: "",
};

const categories = [
  "Документы на землю",
  "Финансовые документы",
  "Коммерческие предложения",
  "Описание проекта",
  "Другое",
];

export function TelegramProjectWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [projects, setProjects] = useState<TelegramProject[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(emptyProject);
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [message, setMessage] = useState("Проверяем Telegram-профиль…");

  const uploadedCount = useMemo(
    () => documents.filter((document) => document.uploaded).length,
    [documents],
  );

  useEffect(() => {
    initializeTelegramMiniApp();
    void bootstrap();
  }, []);

  async function bootstrap() {
    setBusy(true);
    try {
      const auth = await authenticateTelegram();
      setIdentity(auth.user);
      const result = await listTelegramProjects();
      setProjects(result.projects);
      setMessage("Telegram-профиль подтверждён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось войти через Telegram.");
    } finally {
      setBusy(false);
    }
  }

  function startNewProject() {
    setDraft(emptyProject);
    setDocuments([]);
    setMode("edit");
    setMessage("Заполните проект и добавьте документы.");
  }

  function openProject(project: TelegramProject) {
    setDraft({
      id: project.id,
      name: project.name,
      region: project.region,
      activity: project.activity,
      legalForm: project.legal_form ?? "",
      landStatus: project.land_status ?? "",
    });
    setDocuments([]);
    setMode("edit");
    setMessage("Проект загружен из Supabase.");
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setDocuments((current) => [
      ...current,
      ...Array.from(fileList).map((file) => ({
        id: crypto.randomUUID(),
        file,
        category,
        uploaded: false,
      })),
    ]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function saveProject() {
    if (!draft.name.trim()) {
      setMessage("Укажите название проекта.");
      return null;
    }

    setBusy(true);
    try {
      const result = await callTelegramApi<{ project: TelegramProject }>("save_project", {
        project: {
          id: draft.id,
          name: draft.name,
          region: draft.region,
          activity: draft.activity,
          legalForm: draft.legalForm,
          landStatus: draft.landStatus,
        },
      });

      const projectId = result.project.id;
      setDraft((current) => ({ ...current, id: projectId }));

      for (const document of documents.filter((item) => !item.uploaded)) {
        const upload = await callTelegramApi<{ path: string; token: string }>("create_upload_url", {
          projectId,
          fileName: document.file.name,
        });

        const storageResult = await supabase.storage
          .from("gi-project-documents")
          .uploadToSignedUrl(upload.path, upload.token, document.file, {
            contentType: document.file.type || undefined,
          });
        if (storageResult.error) throw storageResult.error;

        await callTelegramApi("register_document", {
          document: {
            projectId,
            category: document.category,
            fileName: document.file.name,
            storagePath: upload.path,
            mimeType: document.file.type || null,
            byteSize: document.file.size,
          },
        });

        setDocuments((current) =>
          current.map((item) =>
            item.id === document.id ? { ...item, uploaded: true } : item,
          ),
        );
      }

      const list = await listTelegramProjects();
      setProjects(list.projects);
      setMessage("Проект и документы сохранены под вашим Telegram-профилем.");
      return projectId;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения проекта.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runCheck() {
    const projectId = draft.id ?? (await saveProject());
    if (!projectId) return;

    setBusy(true);
    try {
      await callTelegramApi("run_check", { projectId });
      const list = await listTelegramProjects();
      setProjects(list.projects);
      setMessage("Проверка записана в историю проекта. Региональный источник пока отмечен как неподключённый.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка запуска проверки.");
    } finally {
      setBusy(false);
    }
  }

  if (!identity) {
    return (
      <main className="app-shell">
        <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
          <section className="glass-surface rounded-[28px] p-6 sm:p-10">
            <div className="icon-tile"><Bot size={22} /></div>
            <h1 className="mt-5 break-words text-3xl font-semibold sm:text-5xl">Вход через Telegram</h1>
            <p className="mt-4 text-base leading-7 text-mist">Проекты открываются только после серверной проверки подписи Telegram.</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm leading-6">
              {busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Проверяем профиль…</span> : message}
            </div>
            <a className="primary-cta mt-6 justify-center" href="https://t.me/stateappstartup_bot">Открыть @stateappstartup_bot <ArrowRight size={16} /></a>
          </section>
        </div>
      </main>
    );
  }

  if (mode === "list") {
    return (
      <main className="app-shell">
        <div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
          <section className="glass-surface rounded-[28px] p-5 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="status-pill"><ShieldCheck size={15} /> Telegram подтверждён</div>
                <h1 className="mt-4 text-3xl font-semibold sm:text-5xl">Мои проекты</h1>
                <p className="mt-2 text-sm text-mist">{identity.firstName}{identity.username ? ` · @${identity.username}` : ""}</p>
              </div>
              <button className="primary-cta justify-center" onClick={startNewProject}><Plus size={16} /> Новый проект</button>
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm">
              {busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Обновляем данные…</span> : message}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {projects.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-white/15 p-6 text-sm leading-6 text-mist">Сохранённых проектов пока нет. Создайте первый проект.</div>
              )}
              {projects.map((project) => (
                <button key={project.id} onClick={() => openProject(project)} className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5 text-left transition hover:border-signal/30">
                  <div className="flex items-start justify-between gap-3">
                    <FolderOpen className="shrink-0 text-signal" size={20} />
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-mist">{project.status}</span>
                  </div>
                  <h2 className="mt-4 break-words text-xl font-semibold">{project.name}</h2>
                  <p className="mt-2 text-sm text-mist">{project.region}</p>
                  <p className="mt-4 text-xs text-mist">Документов: {project.gi_project_documents?.length ?? 0} · Проверок: {project.gi_project_checks?.length ?? 0}</p>
                </button>
              ))}
            </div>

            <button className="secondary-cta mt-6 justify-center" onClick={() => void bootstrap()}><RefreshCw size={15} /> Обновить</button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="mx-auto min-h-screen max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
        <section className="glass-surface rounded-[28px] p-5 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="status-pill"><UserRound size={15} /> {identity.firstName}</div>
              <h1 className="mt-4 break-words text-3xl font-semibold sm:text-5xl">{draft.id ? "Редактирование проекта" : "Новый проект"}</h1>
            </div>
            <button className="secondary-cta justify-center" onClick={() => setMode("list")}>Мои проекты</button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 p-4 sm:p-5">
              <Field label="Название"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
              <Field label="Регион"><input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></Field>
              <Field label="Направление"><input value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })} /></Field>
              <Field label="Форма заявителя"><select value={draft.legalForm} onChange={(event) => setDraft({ ...draft, legalForm: event.target.value })}><option value="">Не выбрана</option><option>Физическое лицо</option><option>ИП</option><option>КФХ</option><option>ООО</option></select></Field>
              <Field label="Земля"><select value={draft.landStatus} onChange={(event) => setDraft({ ...draft, landStatus: event.target.value })}><option value="">Не указана</option><option>Собственность</option><option>Аренда</option><option>Участок выбран</option><option>Участка нет</option></select></Field>
            </div>

            <div className="rounded-[24px] border border-white/10 p-4 sm:p-5">
              <Field label="Категория документа"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
              <input ref={inputRef} className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => addFiles(event.target.files)} />
              <button className="primary-cta mt-4 w-full justify-center" onClick={() => inputRef.current?.click()}><FileUp size={16} /> Добавить файлы</button>
              <div className="mt-4 space-y-2">
                {documents.map((document) => (
                  <div key={document.id} className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm">{document.file.name}</p><p className="text-xs text-mist">{document.category} · {document.uploaded ? "сохранён" : "ожидает"}</p></div>
                    <button aria-label="Удалить файл" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-mist">Подготовлено: {documents.length} · Загружено: {uploadedCount}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm leading-6">
            {busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Выполняется операция…</span> : <span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /> {message}</span>}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button disabled={busy} onClick={() => void saveProject()} className="secondary-cta justify-center"><Save size={15} /> Сохранить</button>
            <button disabled={busy} onClick={() => void runCheck()} className="primary-cta justify-center">Проверить источники <ArrowRight size={15} /></button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-2 block text-xs text-mist">{label}</span>
      <div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:bg-black/20 [&>input]:p-3 [&>input]:outline-none [&>select]:w-full [&>select]:rounded-xl [&>select]:bg-[#11161a] [&>select]:p-3 [&>select]:outline-none">
        {children}
      </div>
    </label>
  );
}
