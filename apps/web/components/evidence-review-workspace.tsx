"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  getEvidenceReviewerStatus,
  listEvidenceReviewTasks,
  reviewEvidenceTask,
  type EvidenceReviewerStatus,
  type EvidenceReviewSummary,
  type EvidenceReviewTask,
} from "../lib/evidence-review";
import { displayValue } from "../lib/government-report-format";
import { initializeTelegramMiniApp } from "../lib/telegram";

const emptySummary: EvidenceReviewSummary = {
  openTasks: 0,
  verifiedTasks: 0,
  blockedTasks: 0,
  rejectedTasks: 0,
  verifiedEvidence: 0,
  verifiedRequirements: 0,
};

export function EvidenceReviewWorkspace() {
  const [status, setStatus] = useState<EvidenceReviewerStatus | null>(null);
  const [tasks, setTasks] = useState<EvidenceReviewTask[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [busy, setBusy] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "blocked" | "rejected">("open");
  const [message, setMessage] = useState("Проверяем доступ к экспертному контуру…");

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "open") return ["pending", "in_progress"].includes(task.task_status);
    return task.task_status === filter;
  }), [filter, tasks]);

  useEffect(() => {
    initializeTelegramMiniApp();
    void load();
  }, []);

  async function load() {
    setBusy(true);
    try {
      const reviewer = await getEvidenceReviewerStatus();
      setStatus(reviewer);
      setSummary(reviewer.summary);
      if (!reviewer.authorized) {
        setTasks([]);
        setMessage("Этот раздел доступен только назначенным экспертам доказательной проверки.");
        return;
      }

      const result = await listEvidenceReviewTasks(100);
      setTasks(result.tasks);
      setSummary(result.summary);
      setMessage(result.tasks.length
        ? `Задач в рабочей очереди: ${result.tasks.length}. Подтверждение возможно только по точной цитате из Tier A документа.`
        : "Открытых задач проверки сейчас нет.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function review(task: EvidenceReviewTask, input: ReviewInput) {
    setReviewingId(task.task_id);
    try {
      const result = await reviewEvidenceTask({
        taskId: task.task_id,
        decision: input.decision,
        quote: input.quote,
        locator: input.locator,
        notes: input.notes,
      });
      setSummary(result.summary);
      setMessage(reviewSuccessMessage(input.decision));
      await load();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setReviewingId(null);
    }
  }

  if (!status && busy) return <LoadingScreen />;
  if (status && !status.authorized) return <AccessDenied message={message} onRetry={() => void load()} />;

  return (
    <main className="app-shell">
      <div className="mx-auto min-h-screen max-w-7xl px-3 py-4 pb-20 sm:px-6 sm:py-8">
        <header className="glass-surface rounded-[30px] p-5 sm:p-8">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="status-pill"><ShieldCheck size={15} /> Экспертный доступ · {roleLabel(status?.role)}</div>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Проверка доказательств</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-mist/55">Здесь требование становится подтверждённым только после точного совпадения цитаты с сохранённой версией официального документа уровня Tier A.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <a href="/" className="secondary-cta"><ArrowLeft size={15} /> К проектам</a>
              <button className="primary-cta" disabled={busy} onClick={() => void load()}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Обновить</button>
            </div>
          </div>
        </header>

        <div className="report-metrics-grid mt-3">
          <Metric title="Открытые задачи" value={summary.openTasks} note="нужно разобрать" />
          <Metric title="Проверено задач" value={summary.verifiedTasks} note="закрыто доказательствами" accent />
          <Metric title="Доказательства" value={summary.verifiedEvidence} note="verified evidence" accent />
          <Metric title="Требования" value={summary.verifiedRequirements} note="подтверждено" accent />
        </div>

        <div className="workspace-notice glass-surface mt-3" role="status">
          {busy ? <span className="flex items-start gap-2"><LoaderCircle className="mt-1 shrink-0 animate-spin text-signal" size={17} /> {message}</span> : <span className="flex items-start gap-2"><CheckCircle2 className="mt-1 shrink-0 text-signal" size={17} /> {message}</span>}
        </div>

        <nav className="report-nav mt-3" aria-label="Фильтр очереди">
          <FilterButton active={filter === "open"} onClick={() => setFilter("open")}>В работе</FilterButton>
          <FilterButton active={filter === "blocked"} onClick={() => setFilter("blocked")}>Заблокировано</FilterButton>
          <FilterButton active={filter === "rejected"} onClick={() => setFilter("rejected")}>Отклонено</FilterButton>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>Все</FilterButton>
        </nav>

        <section className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
          {visibleTasks.map((task) => (
            <EvidenceTaskCard
              key={task.task_id}
              task={task}
              busy={reviewingId === task.task_id}
              disabled={Boolean(reviewingId) || busy}
              onReview={(input) => void review(task, input)}
            />
          ))}
          {!visibleTasks.length ? <div className="glass-surface col-span-full rounded-[26px] p-6 text-sm leading-6 text-mist/45">В выбранной группе задач нет.</div> : null}
        </section>
      </div>
    </main>
  );
}

type ReviewInput = {
  decision: "verified" | "rejected" | "blocked" | "reopened";
  quote?: string;
  locator?: string;
  notes?: string;
};

function EvidenceTaskCard({
  task,
  busy,
  disabled,
  onReview,
}: {
  task: EvidenceReviewTask;
  busy: boolean;
  disabled: boolean;
  onReview: (input: ReviewInput) => void;
}) {
  const [quote, setQuote] = useState(task.candidate_quote ?? "");
  const [locator, setLocator] = useState(task.candidate_locator ?? "");
  const [notes, setNotes] = useState(task.task_notes ?? "");
  const canVerify = task.task_type === "quote_locator" && task.evidence_tier === "A" && task.owner_validation_status === "verified" && Boolean(task.source_version_id);

  return (
    <article className="glass-surface min-w-0 rounded-[28px] p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-signal">{task.measure_code}</p>
          <h2 className="mt-2 break-words text-xl font-semibold leading-7">{task.task_title}</h2>
          <p className="mt-2 break-words text-sm leading-6 text-mist/55">{task.measure_title}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:max-w-44 sm:justify-end">
          <StatusChip value={task.task_status} />
          <span className={`status-chip ${task.evidence_tier === "A" ? "status-chip-active" : ""}`}>Tier {task.evidence_tier ?? "—"}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info title="Требование" value={task.requirement_description ?? "Служебная проверка источника"} />
        <Info title="Ожидаемое значение" value={displayValue(task.expected_value)} />
        <Info title="Документ" value={task.document_title ?? "Документ не привязан"} />
        <Info title="Владелец источника" value={task.owner_validation_status === "verified" ? "Подтверждён" : "Не подтверждён"} />
      </div>

      {task.canonical_url ? <a className="report-link" href={task.canonical_url} target="_blank" rel="noreferrer">Открыть официальный документ <ArrowUpRight size={14} /></a> : null}

      {task.source_text_excerpt ? (
        <details className="requirement-details mt-4">
          <summary><span>Текст сохранённой версии</span><span>{task.source_text_excerpt.length.toLocaleString("ru-RU")} знаков</span><FileSearch size={15} /></summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[18px] border border-white/[.07] bg-black/20 p-4 text-xs leading-6 text-mist/60">{task.source_text_excerpt}</pre>
        </details>
      ) : <div className="mt-4 rounded-[18px] border border-signal/15 bg-signal/[.03] p-4 text-sm leading-6 text-mist/55">Сохранённого текста Tier A пока нет. Подтверждение требования заблокировано.</div>}

      {task.task_type === "quote_locator" ? (
        <div className="mt-4 space-y-3">
          <label className="block"><span className="mb-2 block text-xs text-mist/50">Точная цитата из сохранённой версии</span><textarea className="min-h-32 w-full rounded-[18px] border border-white/[.08] bg-black/25 p-4 text-sm leading-6 text-mist outline-none transition placeholder:text-mist/25 focus:border-signal/30" value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="Вставьте цитату без пересказа и сокращений" /></label>
          <label className="block"><span className="mb-2 block text-xs text-mist/50">Пункт, страница или другой точный locator</span><textarea className="min-h-20 w-full rounded-[18px] border border-white/[.08] bg-black/25 p-4 text-sm leading-6 text-mist outline-none transition placeholder:text-mist/25 focus:border-signal/30" value={locator} onChange={(event) => setLocator(event.target.value)} /></label>
        </div>
      ) : null}

      <label className="mt-3 block"><span className="mb-2 block text-xs text-mist/50">Комментарий эксперта</span><textarea className="min-h-20 w-full rounded-[18px] border border-white/[.08] bg-black/25 p-4 text-sm leading-6 text-mist outline-none transition placeholder:text-mist/25 focus:border-signal/30" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Причина решения, конфликт редакций или следующий шаг" /></label>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {canVerify ? <button className="primary-cta" disabled={disabled} onClick={() => onReview({ decision: "verified", quote, locator, notes })}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Подтвердить</button> : null}
        <button className="secondary-cta" disabled={disabled} onClick={() => onReview({ decision: "blocked", notes })}><Ban size={15} /> Заблокировать</button>
        <button className="secondary-cta" disabled={disabled} onClick={() => onReview({ decision: "rejected", notes })}><X size={15} /> Отклонить</button>
        {["blocked", "rejected"].includes(task.task_status) ? <button className="secondary-cta" disabled={disabled} onClick={() => onReview({ decision: "reopened", notes })}><RotateCcw size={15} /> Вернуть</button> : null}
      </div>

      {!canVerify && task.task_type === "quote_locator" ? <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-mist/40"><CircleAlert className="mt-0.5 shrink-0" size={14} /> Подтверждение недоступно, пока документ не имеет Tier A, проверенного владельца и сохранённой текстовой версии.</p> : null}
    </article>
  );
}

function Metric({ title, value, note, accent = false }: { title: string; value: number; note: string; accent?: boolean }) {
  return <div className="glass-surface min-w-0 rounded-[24px] p-4"><FileCheck2 className={accent ? "text-signal" : "text-mist/45"} size={18} /><p className={`mt-4 text-3xl font-semibold tracking-[-.04em] ${accent ? "text-signal" : "text-mist"}`}>{value}</p><p className="mt-2 text-sm text-mist/60">{title}</p><p className="mt-1 text-[11px] leading-4 text-mist/35">{note}</p></div>;
}

function Info({ title, value }: { title: string; value: string }) {
  return <div className="clay-inset min-w-0 rounded-[18px] p-4"><p className="text-[10px] text-mist/40">{title}</p><p className="mt-2 break-words text-sm leading-6 text-mist/70">{value}</p></div>;
}

function StatusChip({ value }: { value: string }) {
  const labels: Record<string, string> = {
    pending: "Ожидает",
    in_progress: "В работе",
    blocked: "Заблокировано",
    rejected: "Отклонено",
    verified: "Подтверждено",
  };
  return <span className={`status-chip ${value === "verified" ? "status-chip-active" : ""}`}>{labels[value] ?? value}</span>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`shrink-0 rounded-[16px] px-3 py-2 text-[11px] font-medium transition ${active ? "bg-signal/[.12] text-signal" : "text-mist/50 hover:bg-signal/[.08] hover:text-signal"}`} onClick={onClick}>{children}</button>;
}

function LoadingScreen() {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-3xl px-4 py-8"><section className="glass-surface rounded-[28px] p-6 sm:p-10"><LoaderCircle className="animate-spin text-signal" size={28} /><h1 className="mt-5 text-3xl font-semibold">Проверяем экспертный доступ</h1><p className="mt-3 text-sm leading-6 text-mist/50">Авторизация проходит через подпись Telegram Mini App.</p></section></div></main>;
}

function AccessDenied({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-3xl px-4 py-8"><section className="glass-surface rounded-[28px] p-6 sm:p-10"><Ban className="text-signal" size={28} /><h1 className="mt-5 text-3xl font-semibold">Нет экспертного доступа</h1><p className="mt-4 text-sm leading-6 text-mist/55">{message}</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><a className="secondary-cta" href="/"><ArrowLeft size={15} /> К проектам</a><button className="primary-cta" onClick={onRetry}><RefreshCw size={15} /> Проверить снова</button></div></section></div></main>;
}

function roleLabel(role: string | null | undefined) {
  if (role === "owner") return "владелец";
  if (role === "auditor") return "аудитор";
  return "эксперт";
}

function reviewSuccessMessage(decision: ReviewInput["decision"]) {
  if (decision === "verified") return "Требование подтверждено: цитата совпала с сохранённой Tier A версией, решение записано в аудит.";
  if (decision === "blocked") return "Задача заблокирована до появления подходящего документа или устранения конфликта.";
  if (decision === "rejected") return "Кандидат доказательства отклонён и не участвует в Truth Gate.";
  return "Задача возвращена в рабочую очередь.";
}

function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const labels: Record<string, string> = {
    telegram_auth_failed: "Сессия Telegram не подтверждена. Закройте и снова откройте мини-приложение.",
    evidence_reviewer_not_allowed: "Ваш Telegram-профиль не назначен экспертом доказательной проверки.",
    evidence_review_task_not_found: "Задача уже изменена или удалена. Обновите очередь.",
    only_requirement_quote_tasks_can_verify_evidence: "Эта служебная задача не подтверждает отдельное требование.",
    verification_requires_tier_a_document: "Для подтверждения нужен первичный официальный документ уровня Tier A.",
    verification_requires_verified_source_owner: "Владелец официального источника ещё не подтверждён.",
    verification_requires_extracted_source_version: "У документа нет сохранённой текстовой версии.",
    verification_requires_exact_quote: "Цитата слишком короткая или отсутствует.",
    verification_requires_locator: "Укажите пункт, страницу или другой точный locator.",
    quote_not_found_in_source_version: "Цитата не найдена в сохранённой версии документа. Нельзя подтверждать пересказ или изменённый текст.",
  };
  const key = Object.keys(labels).find((item) => raw.includes(item));
  return key ? labels[key] : raw || "Не удалось выполнить экспертную проверку.";
}
