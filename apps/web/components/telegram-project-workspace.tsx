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
  callGovernmentOpportunityApi,
  callTelegramApi,
  initializeTelegramMiniApp,
  listTelegramProjects,
  requestDocumentProcessing,
  type TelegramIdentity,
  type TelegramProject,
} from "../lib/telegram";
import {
  GovernmentOpportunityReport,
  type GovernmentOpportunityReportData,
} from "./government-opportunity-report";
import { ProjectFactReview } from "./project-fact-review";

type DraftDocument = { id: string; file: File; category: string; uploaded: boolean };
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
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "docx", "csv", "txt", "jpg", "jpeg", "png", "webp"];

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
  const [report, setReport] = useState<GovernmentOpportunityReportData | null>(null);

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
    setReport(null);
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
    setReport(null);
    setMode("edit");
    setMessage("Проект загружен. Запустите анализ, чтобы получить актуальный расширенный отчёт.");
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      setMessage("Файлы не выбраны.");
      return;
    }

    const accepted: DraftDocument[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(fileList)) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPTED_EXTENSIONS.includes(extension)) rejected.push(`${file.name}: формат пока не разбирается системой`);
      else if (file.size > MAX_FILE_SIZE) rejected.push(`${file.name}: размер больше 25 МБ`);
      else accepted.push({ id: crypto.randomUUID(), file, category, uploaded: false });
    }

    if (accepted.length) {
      setDocuments((current) => [...current, ...accepted]);
      setMessage(`Подготовлено файлов: ${accepted.length}. Нажмите «Сохранить», чтобы загрузить их.`);
    }
    if (rejected.length) setMessage(rejected.join("; "));
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
      const pending = documents.filter((item) => !item.uploaded);
      let uploadedNow = 0;
      const uploadErrors: string[] = [];

      for (let index = 0; index < pending.length; index += 1) {
        const document = pending[index];
        setMessage(`Загрузка ${index + 1} из ${pending.length}: ${document.file.name}`);

        try {
          const upload = await callTelegramApi<{ path: string; token: string }>("create_upload_url", {
            projectId,
            fileName: document.file.name,
          });
          const storageResult = await supabase.storage
            .from("gi-project-documents")
            .uploadToSignedUrl(upload.path, upload.token, document.file, {
              contentType: document.file.type || "application/octet-stream",
            });
          if (storageResult.error) throw new Error(storageResult.error.message);

          const registered = await callTelegramApi<{ document: { id: string } }>("register_document", {
            document: {
              projectId,
              category: document.category,
              fileName: document.file.name,
              storagePath: upload.path,
              mimeType: document.file.type || null,
              byteSize: document.file.size,
            },
          });
          setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploaded: true } : item));
          uploadedNow += 1;

          void requestDocumentProcessing(registered.document.id).catch(() => {
            // The durable Supabase queue is a fallback when the immediate trigger is unavailable.
          });
        } catch (error) {
          uploadErrors.push(`${document.file.name}: ${error instanceof Error ? error.message : "ошибка загрузки"}`);
        }
      }

      const list = await listTelegramProjects();
      setProjects(list.projects);
      if (uploadErrors.length) {
        setMessage(`Проект сохранён. Загружено: ${uploadedNow}. Не загружено: ${uploadErrors.length}. ${uploadErrors.join("; ")}`);
      } else {
        setMessage(uploadedNow
          ? `Проект сохранён. Загружено документов: ${uploadedNow}. Начат разбор файлов.`
          : "Проект сохранён.");
      }
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
    setReport(null);
    setMessage("Проверяем проект, документы, официальные источники, изменения, требования мер поддержки и план действий…");

    try {
      const result = await callGovernmentOpportunityApi<{ report: GovernmentOpportunityReportData }>(projectId);
      setReport(result.report);
      const list = await listTelegramProjects();
      setProjects(list.projects);

      const readiness = Math.round(result.report.readiness?.score ?? 0);
      const measureMatches = result.report.measure_matches ?? [];
      const confirmedMatches = measureMatches.filter((item) => item.eligibility_status === "match").length;
      const reviewMatches = measureMatches.filter((item) => item.eligibility_status === "manual_review" || item.eligibility_status === "insufficient_data").length;
      const openTasks = result.report.readiness?.open_tasks ?? result.report.roadmap?.length ?? 0;
      setMessage(`Анализ завершён. Готовность: ${readiness}%. Подтверждённо подходит: ${confirmedMatches}. Требуют проверки: ${reviewMatches}. Действий: ${openTasks}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка запуска анализа.");
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
            <h1 className="mt-5 text-3xl font-semibold sm:text-5xl">Вход через Telegram</h1>
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
              {projects.length === 0 && <div className="rounded-[24px] border border-dashed border-white/15 p-6 text-sm leading-6 text-mist">Сохранённых проектов пока нет.</div>}
              {projects.map((project) => (
                <button key={project.id} onClick={() => openProject(project)} className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5 text-left transition hover:border-signal/30">
                  <div className="flex items-start justify-between gap-3"><FolderOpen className="shrink-0 text-signal" size={20} /><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-mist">{project.status}</span></div>
                  <h2 className="mt-4 text-xl font-semibold">{project.name}</h2>
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
      <div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <section className="glass-surface rounded-[28px] p-5 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="status-pill"><UserRound size={15} /> {identity.firstName}</div><h1 className="mt-4 text-3xl font-semibold sm:text-5xl">{draft.id ? "Анализ проекта" : "Новый проект"}</h1></div>
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
              <label className="primary-cta relative mt-4 flex w-full cursor-pointer items-center justify-center overflow-hidden"><FileUp size={16} /> Добавить файлы<input ref={inputRef} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" multiple accept=".pdf,.docx,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => addFiles(event.currentTarget.files)} disabled={busy} /></label>
              <p className="mt-3 text-xs leading-5 text-mist">PDF, DOCX, CSV, TXT и изображения. Максимум 25 МБ. Сканам может потребоваться OCR.</p>
              <div className="mt-4 space-y-2">
                {documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm">{document.file.name}</p><p className="text-xs text-mist">{document.category} · {document.uploaded ? "загружен и поставлен в очередь" : "готов к загрузке"}</p></div>{!document.uploaded && <button aria-label="Удалить файл" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}><Trash2 size={16} /></button>}</div>)}
              </div>
              <p className="mt-4 text-xs text-mist">Подготовлено: {documents.length} · Загружено: {uploadedCount}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm leading-6">
            {busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> {message}</span> : <span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /> {message}</span>}
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button disabled={busy} onClick={() => void saveProject()} className="secondary-cta justify-center"><Save size={15} /> Сохранить и загрузить</button>
            <button disabled={busy} onClick={() => void runCheck()} className="primary-cta justify-center">Провести полный анализ <ArrowRight size={15} /></button>
          </div>
          {draft.id && <ProjectFactReview projectId={draft.id} onFactsChanged={() => setReport(null)} />}
          {report && <GovernmentOpportunityReport report={report} />}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block"><span className="mb-2 block text-xs text-mist">{label}</span><div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:bg-black/20 [&>input]:p-3 [&>input]:outline-none [&>select]:w-full [&>select]:rounded-xl [&>select]:bg-[#11130f] [&>select]:p-3 [&>select]:outline-none">{children}</div></label>;
}
