"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  FileUp,
  FolderOpen,
  Landmark,
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

  const activeStep = report ? 3 : draft.id || documents.length ? 2 : 1;

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
      setMessage("Профиль подтверждён. Можно открыть проект или создать новый.");
    } catch (error) {
      setMessage(friendlyWorkspaceError(error, "Не удалось войти через Telegram."));
    } finally {
      setBusy(false);
    }
  }

  function startNewProject() {
    setDraft(emptyProject);
    setDocuments([]);
    setReport(null);
    setMode("edit");
    setMessage("Заполните профиль проекта. Затем добавьте документы и запустите проверку.");
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
    setMessage("Проект открыт. Запустите анализ, чтобы получить актуальный маршрут.");
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
      if (!ACCEPTED_EXTENSIONS.includes(extension)) rejected.push(`${file.name}: формат пока не поддерживается`);
      else if (file.size > MAX_FILE_SIZE) rejected.push(`${file.name}: размер больше 25 МБ`);
      else accepted.push({ id: crypto.randomUUID(), file, category, uploaded: false });
    }

    if (accepted.length) {
      setDocuments((current) => [...current, ...accepted]);
      setMessage(`Добавлено файлов: ${accepted.length}. Сохраните проект, чтобы начать загрузку и разбор.`);
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
        setMessage(`Загружаем файл ${index + 1} из ${pending.length}: ${document.file.name}`);

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
            // Durable Supabase queue will process the document if the immediate trigger is unavailable.
          });
        } catch (error) {
          uploadErrors.push(`${document.file.name}: ${friendlyWorkspaceError(error, "не удалось загрузить")}`);
        }
      }

      const list = await listTelegramProjects();
      setProjects(list.projects);
      setMessage(uploadErrors.length
        ? `Проект сохранён. Загружено: ${uploadedNow}. Требуют повторной загрузки: ${uploadErrors.length}.`
        : uploadedNow
          ? `Проект сохранён. Загружено документов: ${uploadedNow}. Разбор запущен.`
          : "Проект сохранён.");
      return projectId;
    } catch (error) {
      setMessage(friendlyWorkspaceError(error, "Не удалось сохранить проект."));
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
    setMessage("Проверяем проект, документы, условия программ, доказательства и следующие действия…");

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
      setMessage(`Проверка завершена: готовность ${readiness}%, подтверждённо подходит ${confirmedMatches}, требуют проверки ${reviewMatches}, следующих действий ${openTasks}.`);
    } catch (error) {
      setMessage(friendlyWorkspaceError(error, "Не удалось завершить анализ проекта."));
    } finally {
      setBusy(false);
    }
  }

  if (!identity) return <TelegramLogin busy={busy} message={message} onRetry={() => void bootstrap()} />;
  if (mode === "list") return <ProjectList identity={identity} projects={projects} busy={busy} message={message} onNew={startNewProject} onOpen={openProject} onRefresh={() => void bootstrap()} />;

  return (
    <main className="app-shell">
      <div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <header className="glass-surface rounded-[28px] p-4 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="status-pill"><UserRound size={15} /> {identity.firstName}</div>
              <h1 className="mt-4 break-words text-3xl font-semibold tracking-[-.035em] sm:text-5xl">{draft.id ? draft.name || "Анализ проекта" : "Новый проект"}</h1>
              <p className="mt-2 text-sm leading-6 text-mist/50">Заполните данные, загрузите документы и получите проверенный маршрут до подачи.</p>
            </div>
            <button className="secondary-cta" onClick={() => setMode("list")}><ArrowLeft size={15} /> Мои проекты</button>
          </div>
          <WorkspaceStepper active={activeStep} />
        </header>

        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
          <section className="workspace-panel glass-surface">
            <SectionHeading icon={<Landmark size={18} />} title="Профиль проекта" subtitle="Основные данные для проверки условий программ" />
            <Field label="Название проекта"><input value={draft.name} placeholder="Например: ягодная ферма и агротуризм" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Регион"><input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></Field>
            <Field label="Направление"><input value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Форма заявителя"><select value={draft.legalForm} onChange={(event) => setDraft({ ...draft, legalForm: event.target.value })}><option value="">Не выбрана</option><option>Физическое лицо</option><option>ИП</option><option>КФХ</option><option>ООО</option></select></Field>
              <Field label="Статус земли"><select value={draft.landStatus} onChange={(event) => setDraft({ ...draft, landStatus: event.target.value })}><option value="">Не указан</option><option>Собственность</option><option>Аренда</option><option>Участок выбран</option><option>Участка нет</option></select></Field>
            </div>
          </section>

          <section className="workspace-panel glass-surface">
            <SectionHeading icon={<FileText size={18} />} title="Документы" subtitle="Файлы разбираются, дубликаты определяются автоматически" />
            <Field label="Категория документа"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <label className="primary-cta relative mt-4 flex w-full cursor-pointer items-center justify-center overflow-hidden"><FileUp size={16} /> Добавить файлы<input ref={inputRef} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" multiple accept=".pdf,.docx,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => addFiles(event.currentTarget.files)} disabled={busy} /></label>
            <p className="mt-3 text-xs leading-5 text-mist/45">PDF, DOCX, CSV, TXT и изображения до 25 МБ. Сканированные файлы распознаются отдельно.</p>
            <div className="mt-4 space-y-2">
              {documents.map((document) => <DocumentRow key={document.id} document={document} onDelete={() => setDocuments((current) => current.filter((item) => item.id !== document.id))} />)}
              {!documents.length ? <div className="rounded-[18px] border border-dashed border-white/10 p-4 text-sm leading-6 text-mist/40">Новые файлы ещё не добавлены. Ранее загруженные документы учитываются системой автоматически.</div> : null}
            </div>
            <div className="mt-4 compact-row"><span>Подготовлено: {documents.length}</span><strong>Загружено: {uploadedCount}</strong></div>
          </section>
        </div>

        <div className="workspace-notice glass-surface mt-3" role="status">
          {busy ? <span className="flex items-start gap-2"><LoaderCircle className="mt-1 shrink-0 animate-spin text-signal" size={17} /> {message}</span> : <span className="flex items-start gap-2"><CheckCircle2 className="mt-1 shrink-0 text-signal" size={17} /> {message}</span>}
        </div>

        <div className="glass-surface sticky bottom-3 z-30 mt-3 grid gap-2 rounded-[24px] p-3 shadow-2xl sm:grid-cols-2">
          <button disabled={busy} onClick={() => void saveProject()} className="secondary-cta"><Save size={15} /> Сохранить проект</button>
          <button disabled={busy} onClick={() => void runCheck()} className="primary-cta">Провести полную проверку <ArrowRight size={15} /></button>
        </div>

        {draft.id ? <ProjectFactReview projectId={draft.id} onFactsChanged={() => setReport(null)} /> : null}
        {report ? <GovernmentOpportunityReport report={report} /> : null}
      </div>
    </main>
  );
}

function TelegramLogin({ busy, message, onRetry }: { busy: boolean; message: string; onRetry: () => void }) {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-3xl px-4 py-8"><section className="glass-surface rounded-[28px] p-6 sm:p-10"><div className="brand-mark"><Bot size={22} /></div><h1 className="mt-5 text-3xl font-semibold sm:text-5xl">Вход через Telegram</h1><p className="mt-4 text-base leading-7 text-mist/60">Проекты открываются только после серверной проверки подписи Telegram.</p><div className="workspace-notice mt-6">{busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Проверяем профиль…</span> : message}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button className="secondary-cta" onClick={onRetry} disabled={busy}><RefreshCw size={15} /> Повторить</button><a className="primary-cta" href="https://t.me/stateappstartup_bot">Открыть бота <ArrowRight size={16} /></a></div></section></div></main>;
}

function ProjectList({ identity, projects, busy, message, onNew, onOpen, onRefresh }: { identity: TelegramIdentity; projects: TelegramProject[]; busy: boolean; message: string; onNew: () => void; onOpen: (project: TelegramProject) => void; onRefresh: () => void }) {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8"><section className="glass-surface rounded-[28px] p-5 sm:p-8"><div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="status-pill"><ShieldCheck size={15} /> Telegram подтверждён</div><h1 className="mt-4 text-3xl font-semibold tracking-[-.035em] sm:text-5xl">Проекты</h1><p className="mt-2 text-sm text-mist/50">{identity.firstName}{identity.username ? ` · @${identity.username}` : ""}</p></div><button className="primary-cta" onClick={onNew}><Plus size={16} /> Новый проект</button></div><div className="workspace-notice mt-6">{busy ? <span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Обновляем данные…</span> : message}</div><div className="mt-6 grid gap-3 md:grid-cols-2">{projects.length === 0 ? <div className="rounded-[24px] border border-dashed border-white/15 p-6 text-sm leading-6 text-mist/45">Сохранённых проектов пока нет.</div> : projects.map((project) => <button key={project.id} onClick={() => onOpen(project)} className="clay-inset min-w-0 rounded-[24px] p-5 text-left transition hover:border-signal/30"><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3"><FolderOpen className="text-signal" size={20} /><div className="min-w-0"><h2 className="break-words text-xl font-semibold leading-7">{project.name}</h2><p className="mt-2 break-words text-sm leading-6 text-mist/50">{project.region}</p></div><span className="status-chip">{project.status}</span></div><p className="mt-4 text-xs leading-5 text-mist/40">Документов: {project.gi_project_documents?.length ?? 0} · Проверок: {project.gi_project_checks?.length ?? 0}</p></button>)}</div><button className="secondary-cta mt-6" onClick={onRefresh}><RefreshCw size={15} /> Обновить список</button></section></div></main>;
}

function WorkspaceStepper({ active }: { active: number }) {
  const steps = [
    ["Профиль", "Данные проекта"],
    ["Документы", "Файлы и факты"],
    ["Результат", "Меры и маршрут"],
  ];
  return <div className="workspace-stepper mt-6">{steps.map(([title, detail], index) => { const number = index + 1; const enabled = number <= active; return <div key={title} className={`workspace-step ${enabled ? "workspace-step-active" : ""}`}><span className="workspace-step-number">{number}</span><div className="mt-2 min-w-0"><p className="font-medium leading-5">{title}</p><p className="mt-1 text-[10px] leading-4 text-mist/40">{detail}</p></div></div>; })}</div>;
}

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3"><div className="brand-mark h-10 w-10 rounded-[16px]">{icon}</div><div className="min-w-0"><h2 className="text-xl font-semibold leading-7">{title}</h2><p className="mt-1 text-xs leading-5 text-mist/45">{subtitle}</p></div></div>;
}

function DocumentRow({ document, onDelete }: { document: DraftDocument; onDelete: () => void }) {
  return <div className="clay-inset grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] p-3"><div className="min-w-0"><p className="truncate text-sm">{document.file.name}</p><p className="mt-1 break-words text-xs leading-5 text-mist/40">{document.category} · {document.uploaded ? "загружен, разбор запущен" : "готов к загрузке"}</p></div>{document.uploaded ? <CheckCircle2 className="text-signal" size={17} /> : <button className="icon-button h-9 w-9 rounded-[14px]" aria-label="Удалить файл" onClick={onDelete}><Trash2 size={15} /></button>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block min-w-0"><span className="mb-2 block text-xs text-mist/50">{label}</span>{children}</label>;
}

function friendlyWorkspaceError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("permission denied") || normalized.includes("not authorized")) return "Нет доступа к данным. Повторно откройте мини-приложение через Telegram.";
  if (normalized.includes("initdata") || normalized.includes("telegram authentication")) return "Сессия Telegram устарела. Закройте и снова откройте мини-приложение.";
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("timeout")) return "Сервис временно не ответил. Данные сохранены — повторите действие через несколько секунд.";
  if (normalized.includes("storage") || normalized.includes("upload")) return "Не удалось загрузить файл. Остальные документы и проект сохранены.";
  return raw && raw.length <= 180 ? raw : fallback;
}
