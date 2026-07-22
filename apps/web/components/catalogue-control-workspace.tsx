"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Database,
  FileSearch,
  Landmark,
  ListChecks,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getCatalogueControlStatus,
  listMeasureCandidates,
  runProjectDataPlaneE2E,
  type CatalogueControlStatus,
  type CatalogueControlSummary,
  type CatalogueProject,
  type MeasureCandidate,
  type ProjectE2EAudit,
} from "../lib/catalogue-control";
import { initializeTelegramMiniApp } from "../lib/telegram";

const emptySummary: CatalogueControlSummary = {
  active_measures: 0,
  candidate_measures: 0,
  machine_candidates: 0,
  needs_review_candidates: 0,
  human_approved_candidates: 0,
  promoted_candidates: 0,
  verified_evidence: 0,
  verified_requirements: 0,
  latest_e2e: null,
};

type CandidateFilter = "all" | "machine_match" | "needs_review" | "human_approved" | "promoted";

export function CatalogueControlWorkspace() {
  const [status, setStatus] = useState<CatalogueControlStatus | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [candidates, setCandidates] = useState<MeasureCandidate[]>([]);
  const [projects, setProjects] = useState<CatalogueProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [latestAudit, setLatestAudit] = useState<ProjectE2EAudit | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [busy, setBusy] = useState(true);
  const [runningE2E, setRunningE2E] = useState(false);
  const [message, setMessage] = useState("Проверяем экспертный доступ к каталогу…");

  const visibleCandidates = useMemo(() => candidates.filter((candidate) => (
    filter === "all" || candidate.candidate_status === filter
  )), [candidates, filter]);

  useEffect(() => {
    initializeTelegramMiniApp();
    void load();
  }, []);

  async function load() {
    setBusy(true);
    try {
      const access = await getCatalogueControlStatus();
      setStatus(access);
      setSummary(access.summary);
      setProjects(access.projects);
      setSelectedProjectId((current) => current || access.projects[0]?.id || "");

      if (!access.authorized) {
        setCandidates([]);
        setMessage("Контур каталога доступен только назначенным экспертам.");
        return;
      }

      const result = await listMeasureCandidates(200);
      setCandidates(result.candidates);
      setSummary(result.summary);
      setProjects(result.projects);
      setSelectedProjectId((current) => current || result.projects[0]?.id || "");
      setMessage(
        `Активных мер: ${result.summary.active_measures}. Кандидатов: ${result.summary.candidate_measures}. ` +
        "Кандидаты не участвуют в eligibility до экспертного подтверждения и отдельного продвижения.",
      );
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runE2E() {
    if (!selectedProjectId) return;
    setRunningE2E(true);
    try {
      const result = await runProjectDataPlaneE2E(selectedProjectId);
      setLatestAudit(result.audit);
      setSummary(result.summary);
      setMessage(result.audit.status === "passed"
        ? "Data-plane E2E пройден: документы, факты, анализ, Truth Gate и persistence связаны."
        : "Data-plane E2E выявил незакрытые ворота. Проверьте список ниже.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setRunningE2E(false);
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
              <div className="status-pill"><ShieldCheck size={15} /> Catalogue Control · {roleLabel(status?.role)}</div>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-[-.04em] sm:text-5xl">Каталог мер и кандидатов</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-mist/55">
                Активный каталог участвует в проверке проекта. Кандидатный слой хранит найденные реальные механизмы, но остаётся изолированным до проверки первичного положения, обязательных требований и решения эксперта.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <a href="/" className="secondary-cta"><ArrowLeft size={15} /> К проектам</a>
              <a href="/evidence-review" className="secondary-cta"><FileSearch size={15} /> Evidence Review</a>
              <button className="primary-cta" disabled={busy} onClick={() => void load()}>
                {busy ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Обновить
              </button>
            </div>
          </div>
        </header>

        <div className="report-metrics-grid mt-3">
          <Metric title="Активные меры" value={summary.active_measures} note="участвуют в eligibility" accent />
          <Metric title="Кандидаты" value={summary.candidate_measures} note="изолированный слой" />
          <Metric title="Одобрено экспертом" value={summary.human_approved_candidates} note="ещё не promoted" />
          <Metric title="Проверенные требования" value={summary.verified_requirements} note="human-reviewed Tier A" accent />
        </div>

        <div className="workspace-notice glass-surface mt-3" role="status">
          {busy
            ? <span className="flex items-start gap-2"><LoaderCircle className="mt-1 shrink-0 animate-spin text-signal" size={17} /> {message}</span>
            : <span className="flex items-start gap-2"><CircleAlert className="mt-1 shrink-0 text-signal" size={17} /> {message}</span>}
        </div>

        <section className="glass-surface mt-3 rounded-[28px] p-4 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-signal"><ListChecks size={18} /><span className="text-xs font-semibold uppercase tracking-[.16em]">Project Data-Plane E2E</span></div>
              <h2 className="mt-3 text-2xl font-semibold">Документ → факт → анализ → Truth Gate → отчёт</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-mist/55">
                Проверка подтверждает связность production-данных. Она не подменяет внешний transport-тест Telegram initData.
              </p>
              {summary.latest_e2e ? (
                <p className="mt-3 text-xs text-mist/45">
                  Последний аудит: <strong className={summary.latest_e2e.status === "passed" ? "text-signal" : "text-amber-300"}>{statusLabel(summary.latest_e2e.status)}</strong> · {formatDate(summary.latest_e2e.created_at)}
                </p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,320px)_auto]">
              <select
                className="min-h-11 min-w-0 rounded-[16px] border border-white/[.08] bg-black/25 px-4 text-sm text-mist outline-none focus:border-signal/30"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.region}</option>)}
              </select>
              <button className="primary-cta" disabled={!selectedProjectId || runningE2E} onClick={() => void runE2E()}>
                {runningE2E ? <LoaderCircle className="animate-spin" size={15} /> : <Play size={15} />} Запустить E2E
              </button>
            </div>
          </div>

          {latestAudit ? <E2EResult audit={latestAudit} /> : null}
        </section>

        <nav className="report-nav mt-3" aria-label="Фильтр кандидатов">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>Все · {summary.candidate_measures}</FilterButton>
          <FilterButton active={filter === "machine_match"} onClick={() => setFilter("machine_match")}>Машинное совпадение · {summary.machine_candidates}</FilterButton>
          <FilterButton active={filter === "needs_review"} onClick={() => setFilter("needs_review")}>Нужна проверка · {summary.needs_review_candidates}</FilterButton>
          <FilterButton active={filter === "human_approved"} onClick={() => setFilter("human_approved")}>Одобрено · {summary.human_approved_candidates}</FilterButton>
          <FilterButton active={filter === "promoted"} onClick={() => setFilter("promoted")}>В каталоге · {summary.promoted_candidates}</FilterButton>
        </nav>

        <section className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
          {visibleCandidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}
          {!visibleCandidates.length ? (
            <div className="glass-surface col-span-full rounded-[26px] p-6 text-sm leading-6 text-mist/45">В выбранной группе кандидатов нет.</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function CandidateCard({ candidate }: { candidate: MeasureCandidate }) {
  return (
    <article className="glass-surface min-w-0 rounded-[28px] p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-medium text-signal">{candidate.candidate_code}</p>
          <h2 className="mt-2 break-words text-xl font-semibold leading-7">{candidate.title}</h2>
          <p className="mt-2 break-words text-sm leading-6 text-mist/55">{candidate.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:max-w-56 sm:justify-end">
          <StatusChip value={candidate.candidate_status} />
          <span className={`status-chip ${candidate.evidence_tier === "A" ? "status-chip-active" : ""}`}>Tier {candidate.evidence_tier}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info title="Оператор" value={candidate.authority} />
        <Info title="Тип" value={measureTypeLabel(candidate.measure_type)} />
        <Info title="Заявители — кандидат" value={candidate.applicant_types.length ? candidate.applicant_types.join(", ") : "Не извлечены"} />
        <Info title="Максимальная сумма" value={formatAmount(candidate.max_amount)} />
      </div>

      <div className="mt-4 rounded-[18px] border border-amber-300/15 bg-amber-300/[.035] p-4 text-sm leading-6 text-mist/60">
        <strong className="text-amber-200">Не является допуском:</strong> запись подтверждает существование названия механизма в сохранённом официальном источнике, но не содержит полного набора проверенных требований.
      </div>

      <details className="requirement-details mt-4">
        <summary><span>Provenance кандидата</span><span>{Math.round(candidate.confidence * 100)}% confidence</span><Database size={15} /></summary>
        <div className="mt-3 space-y-3">
          <Info title="Locator" value={candidate.source_locator} />
          <blockquote className="break-words rounded-[18px] border border-white/[.07] bg-black/20 p-4 text-sm leading-6 text-mist/60">{candidate.evidence_quote}</blockquote>
          <p className="text-xs leading-5 text-mist/40">Владелец источника: {candidate.owner_validation_status === "verified" ? "подтверждён" : "требует проверки"}. Eligibility: запрещён до promotion.</p>
        </div>
      </details>

      <a className="report-link" href={candidate.official_url} target="_blank" rel="noreferrer">Открыть официальный источник <ArrowUpRight size={14} /></a>
    </article>
  );
}

function E2EResult({ audit }: { audit: ProjectE2EAudit }) {
  const gates = Object.entries(audit.gates);
  return (
    <div className="mt-5 rounded-[22px] border border-white/[.07] bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {audit.status === "passed" ? <CheckCircle2 className="text-signal" size={18} /> : <CircleAlert className="text-amber-300" size={18} />}
          <strong>{audit.status === "passed" ? "Data-plane E2E пройден" : "Data-plane E2E не пройден"}</strong>
        </div>
        <span className="status-chip">{gates.filter(([, passed]) => passed).length}/{gates.length} gates</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gates.map(([gate, passed]) => (
          <div key={gate} className="flex min-w-0 items-start gap-2 rounded-[15px] border border-white/[.06] bg-white/[.02] p-3 text-xs leading-5">
            {passed ? <CheckCircle2 className="mt-0.5 shrink-0 text-signal" size={14} /> : <CircleAlert className="mt-0.5 shrink-0 text-amber-300" size={14} />}
            <span className="break-words text-mist/55">{gateLabel(gate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ title, value, note, accent = false }: { title: string; value: number; note: string; accent?: boolean }) {
  return (
    <article className="glass-surface rounded-[24px] p-4 sm:p-5">
      <p className="text-xs text-mist/45">{title}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ? "text-signal" : "text-mist"}`}>{value.toLocaleString("ru-RU")}</p>
      <p className="mt-1 text-xs text-mist/35">{note}</p>
    </article>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <div className="min-w-0 rounded-[16px] border border-white/[.06] bg-white/[.02] p-3"><p className="text-[11px] text-mist/35">{title}</p><p className="mt-1 break-words text-sm leading-5 text-mist/65">{value}</p></div>;
}

function StatusChip({ value }: { value: MeasureCandidate["candidate_status"] }) {
  const active = value === "human_approved" || value === "promoted";
  return <span className={`status-chip ${active ? "status-chip-active" : ""}`}>{candidateStatusLabel(value)}</span>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? "report-nav-active" : ""} onClick={onClick}>{children}</button>;
}

function LoadingScreen() {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-3xl px-4 py-8"><section className="glass-surface rounded-[28px] p-6 sm:p-10"><LoaderCircle className="animate-spin text-signal" size={28} /><h1 className="mt-5 text-3xl font-semibold">Проверяем доступ к каталогу</h1><p className="mt-3 text-sm leading-6 text-mist/50">Авторизация проходит через подпись Telegram Mini App.</p></section></div></main>;
}

function AccessDenied({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="app-shell"><div className="mx-auto min-h-screen max-w-3xl px-4 py-8"><section className="glass-surface rounded-[28px] p-6 sm:p-10"><Landmark className="text-signal" size={28} /><h1 className="mt-5 text-3xl font-semibold">Доступ ограничен</h1><p className="mt-3 text-sm leading-6 text-mist/55">{message}</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><a className="secondary-cta" href="/"><ArrowLeft size={15} /> К проектам</a><button className="primary-cta" onClick={onRetry}><RefreshCw size={15} /> Повторить</button></div></section></div></main>;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Не удалось открыть контур каталога";
  if (message.includes("catalogue_reviewer_not_allowed")) return "Telegram-профиль не включён в реестр экспертов каталога.";
  if (message.includes("project_not_found")) return "Проект не найден или не принадлежит текущему Telegram-профилю.";
  if (message.includes("telegram_auth_failed")) return "Telegram-сессия не прошла серверную проверку.";
  return message;
}

function roleLabel(role: string | null | undefined) {
  if (role === "owner") return "владелец";
  if (role === "auditor") return "аудитор";
  return "эксперт";
}

function candidateStatusLabel(status: MeasureCandidate["candidate_status"]) {
  if (status === "machine_match") return "Кандидат машины";
  if (status === "needs_review") return "Нужна проверка";
  if (status === "human_approved") return "Одобрено экспертом";
  if (status === "promoted") return "Продвинуто в каталог";
  return "Отклонено";
}

function measureTypeLabel(value: string) {
  const labels: Record<string, string> = {
    grant: "Грант",
    subsidy: "Субсидия",
    loan: "Кредит",
    leasing: "Лизинг",
    guarantee: "Поручительство",
    land: "Земля",
    property: "Имущественная",
    infrastructure: "Инфраструктура",
    consulting: "Консультационная",
  };
  return labels[value] ?? value;
}

function formatAmount(value: number | null) {
  if (value == null) return "Не подтверждена";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(value: "passed" | "failed") {
  return value === "passed" ? "пройден" : "не пройден";
}

function gateLabel(value: string) {
  const labels: Record<string, string> = {
    project_owned: "Проект принадлежит Telegram-профилю",
    documents_present: "Документы загружены",
    documents_all_parsed: "Все документы разобраны",
    chunks_present: "Текстовые фрагменты сохранены",
    fact_candidates_present: "Кандидаты фактов извлечены",
    fact_candidates_resolved: "Кандидаты фактов рассмотрены",
    verified_project_facts_present: "Подтверждённые факты проекта есть",
    latest_check_completed: "Последний анализ завершён",
    federal_checked: "Федеральный контур проверен",
    regional_checked: "Региональный контур проверен",
    measure_matches_present: "Подбор мер выполнен",
    truth_gate_recorded: "Truth Gate зафиксирован",
    report_persisted: "Отчёт сохранён",
    decision_cards_persisted: "Decision Cards сохранены",
    raw_json_not_required: "Пользовательский UI без raw JSON",
  };
  return labels[value] ?? value;
}
