"use client";

import { animate, motion } from "motion/react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, Bell, Bot, BrainCircuit, BriefcaseBusiness,
  CalendarClock, Check, ChevronRight, CircleHelp, FileDiff, FileSearch, Gauge,
  GitBranch, Home, Landmark, Menu, Network, Radar, Search, ShieldCheck, Sparkles,
  Target, X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const modes = [
  [Gauge, "Decide"], [FileSearch, "Investigate"], [Radar, "Monitor"],
  [BrainCircuit, "Forecast"], [GitBranch, "Knowledge"]
] as const;

const lenses = [
  ["Стратегия", 72], ["Территория", 88], ["Экономика", 54], ["Финансы", 38],
  ["Право", 31], ["Поддержка", 46], ["Производство", 81], ["Логистика", 64],
  ["Рынок", 58], ["Клиенты", 44], ["Доказательства", 67], ["Документы", 52],
  ["Риски", 41], ["Прогноз", 36]
] as const;

const evidenceItems = [
  {
    id: "evidence-order-88",
    title: "Перечень затрат по гранту «Агротуризм»",
    type: "Официальный документ",
    state: "Проверено",
    authority: "Минсельхоз России",
    document: "Приказ от 17.02.2026 № 88",
    source: "publication.pravo.gov.ru",
    quote: "Перечень направлений расходов включает создание и развитие объектов сельского туризма.",
    claim: "Проект может рассматриваться в контуре поддержки агротуризма.",
    captured: "25 марта 2026",
    confidence: 92
  },
  {
    id: "evidence-demand-map",
    title: "Карта доходности агросервиса КБР",
    type: "Проектный документ",
    state: "Проверено",
    authority: "Проектная аналитика",
    document: "Карта районов и спроса",
    source: "Внутренний документ проекта",
    quote: "Баксанский район получил наивысший рейтинг по концентрации садов, повторяемости работ и логистике.",
    claim: "Баксанский кластер выглядит приоритетной зоной запуска.",
    captured: "5 марта 2026",
    confidence: 78
  },
  {
    id: "evidence-regional-rules",
    title: "Правила регионального конкурса КБР",
    type: "Официальный документ",
    state: "Не найдено",
    authority: "Минсельхоз КБР",
    document: "Актуальный конкурсный порядок",
    source: "Требуется официальный источник",
    quote: "Точная цитата отсутствует: документ ещё не зафиксирован в Evidence Locker.",
    claim: "Нельзя подтвердить форму заявителя, сроки и полный перечень допустимых расходов.",
    captured: "Не зафиксировано",
    confidence: 18
  }
] as const;

const timeline = [
  { date: "25 мар", title: "Опубликован приказ № 88", detail: "Обновлён перечень затрат по агротуризму.", tone: "signal" },
  { date: "18 июл", title: "Зафиксирован проектный профиль", detail: "КФХ, техника, агросервис и будущий агротуризм.", tone: "violet" },
  { date: "Сегодня", title: "Обнаружены 3 критических пробела", detail: "Право, региональный конкурс и финансовая модель.", tone: "danger" }
] as const;

export function IntelligenceWorkspace() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(evidenceItems[0].id);
  const [activeMode, setActiveMode] = useState("Decide");

  const selectedEvidence = useMemo(
    () => evidenceItems.find((item) => item.id === selectedEvidenceId) ?? evidenceItems[0],
    [selectedEvidenceId]
  );

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animate("[data-progress]", { scaleX: [0, 1] }, { duration: 0.7, delay: 0.05 });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="workspace-frame">
        <aside className="desktop-sidebar glass-surface">
          <Brand />
          <p className="sidebar-label">Operating modes</p>
          <nav className="space-y-1 text-sm">
            {modes.map(([Icon, label]) => (
              <button key={label} onClick={() => setActiveMode(label)} className={`nav-item ${activeMode === label ? "nav-active" : ""}`}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="runtime-card">
            <div className="mb-3 flex items-center gap-2 text-sm"><Bot size={16} className="text-signal" /> Factory Runtime</div>
            <p className="text-xs leading-5 text-mist">Evidence Lock, Intelligence Lenses и Quality Gates активны.</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-signal"><span className="signal-dot" /> Система активна</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 pb-24 xl:pb-0">
          <header className="topbar glass-surface">
            <div className="flex min-w-0 items-center gap-3">
              <button className="icon-button xl:hidden" aria-label="Открыть меню"><Menu size={19} /></button>
              <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.22em] text-mist">Decision OS / {activeMode}</p><h1 className="truncate text-sm font-semibold sm:text-base">Агросервис: техника → производство → агротуризм</h1></div>
            </div>
            <button className="command-trigger" onClick={() => setPaletteOpen(true)}><Search size={16} /><span>Найти решение, документ или действие</span><kbd>⌘ K</kbd></button>
            <div className="flex items-center gap-2"><button className="icon-button hidden sm:grid"><Bell size={17} /></button><button className="icon-button hidden sm:grid"><CircleHelp size={17} /></button><button className="avatar">АК</button></div>
          </header>

          <button className="mobile-context glass-surface md:hidden" onClick={() => setPaletteOpen(true)}><Search size={16} /><span>Командный поиск</span><kbd>⌘K</kbd></button>

          <div className="decision-strip glass-surface">
            <div><span className="signal-dot" /> Анализ обновлён</div>
            <div className="hidden sm:flex">8 подтверждённых фактов</div>
            <div className="hidden lg:flex">3 критических пробела</div>
            <button onClick={() => setSelectedEvidenceId("evidence-order-88")}>Открыть трассировку <ArrowRight size={14} /></button>
          </div>

          <div className="decision-grid">
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="decision-hero glass-surface">
              <div className="hero-mesh" />
              <div className="relative z-10">
                <div className="status-pill"><AlertTriangle size={14} /> Решение: пока рано</div>
                <p className="decision-question">Можно ли запускать проект сейчас?</p>
                <h2 className="hero-title"><span>Нет — сначала нужно закрыть три критических пробела.</span></h2>
                <p className="hero-copy">Потенциал проекта высокий, но текущих доказательств недостаточно для безопасного решения по гранту, юридической форме и финансированию.</p>
                <div className="mt-6 flex flex-wrap gap-2"><button className="primary-cta">Закрыть первый блокер <ArrowRight size={15} /></button><button className="secondary-cta">Сформировать Decision Brief</button></div>
              </div>
              <div className="decision-score"><div className="score-ring"><span className="text-4xl font-semibold">62%</span><span className="text-[10px] uppercase tracking-[.18em] text-mist">уверенность</span></div><p>Повторная проверка после получения правил конкурса и КП поставщиков.</p></div>
            </motion.section>

            <section className="next-action-card glass-surface">
              <SectionHead eyebrow="Next action" title="Первое действие" icon={<Target size={18} />} />
              <div className="action-priority"><span>01</span><div><p>Найти актуальный порядок конкурса Минсельхоза КБР</p><small>Он определит форму заявителя, сроки, лимиты и допустимые расходы.</small></div></div>
              <button className="full-action">Начать расследование <ArrowRight size={15} /></button>
            </section>

            <section className="evidence-explorer glass-surface">
              <SectionHead eyebrow="Evidence explorer" title="Почему система так решила" icon={<ShieldCheck size={18} />} />
              <div className="evidence-layout">
                <div className="evidence-list">
                  {evidenceItems.map((item) => <button key={item.id} onClick={() => setSelectedEvidenceId(item.id)} className={`evidence-select ${selectedEvidenceId === item.id ? "active" : ""}`}><span className={item.state === "Проверено" ? "evidence-state verified" : "evidence-state missing"} /><div><p>{item.title}</p><small>{item.type} · {item.state}</small></div><ChevronRight size={15} /></button>)}
                </div>
                <article className="evidence-detail">
                  <div className="evidence-detail-head"><div><p className="eyebrow">Claim</p><h3>{selectedEvidence.claim}</h3></div><span>{selectedEvidence.confidence}%</span></div>
                  <blockquote>“{selectedEvidence.quote}”</blockquote>
                  <dl><div><dt>Документ</dt><dd>{selectedEvidence.document}</dd></div><div><dt>Орган</dt><dd>{selectedEvidence.authority}</dd></div><div><dt>Источник</dt><dd>{selectedEvidence.source}</dd></div><div><dt>Зафиксировано</dt><dd>{selectedEvidence.captured}</dd></div></dl>
                  <button className="trace-button">Открыть полную трассировку <ArrowRight size={14} /></button>
                </article>
              </div>
            </section>

            <section className="timeline-card glass-surface">
              <SectionHead eyebrow="Monitor" title="Что изменилось" icon={<CalendarClock size={18} />} />
              <div className="timeline-list">{timeline.map((item) => <div className="timeline-row" key={item.title}><span className={`timeline-dot ${item.tone}`} /><time>{item.date}</time><div><p>{item.title}</p><small>{item.detail}</small></div></div>)}</div>
              <button className="text-action">Открыть полный Timeline <ArrowRight size={14} /></button>
            </section>

            <section className="brief-card glass-surface">
              <SectionHead eyebrow="Decision brief" title="Краткий итог" icon={<FileDiff size={18} />} />
              <div className="brief-status"><AlertTriangle size={18} /><div><p>Статус: недостаточно доказательств</p><small>Проект не отклонён. Решение отложено до проверки обязательных условий.</small></div></div>
              <div className="brief-columns"><BriefBlock title="Уже подтверждено" icon={<Check size={16} />} items={["Сильный территориальный кластер", "Повторяемые операции", "Связь с агротуризмом"]} /><BriefBlock title="Блокирует решение" icon={<AlertTriangle size={16} />} items={["Правила конкурса КБР", "Финансовая модель", "Форма КФХ/ООО"]} /></div>
            </section>

            <section className="lens-card-wide glass-surface">
              <SectionHead eyebrow="Intelligence lenses" title="Покрытие решения" icon={<Sparkles size={18} />} />
              <div className="lens-grid">{lenses.map(([name, value]) => <LensCard key={name} name={name} value={value} />)}</div>
            </section>
          </div>
        </section>
      </div>

      <nav className="mobile-dock glass-surface xl:hidden" aria-label="Мобильная навигация">{modes.slice(0, 4).map(([Icon, label]) => <button key={label} onClick={() => setActiveMode(label)} className={activeMode === label ? "dock-active" : ""}><Icon size={18} /><span>{label}</span></button>)}</nav>

      {paletteOpen && <div className="palette-backdrop" role="presentation" onMouseDown={() => setPaletteOpen(false)}><motion.div initial={{ opacity: 0, scale: .98, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="command-palette glass-surface" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="palette-search"><Search size={18} /><input autoFocus placeholder="Найти решение, документ или действие..." /><button onClick={() => setPaletteOpen(false)}><X size={18} /></button></div><div className="palette-section"><p>Operating modes</p>{modes.map(([Icon, label]) => <button key={label} onClick={() => { setActiveMode(label); setPaletteOpen(false); }}><Icon size={17} /><span>{label}</span><kbd>↵</kbd></button>)}</div><div className="palette-section"><p>Быстрые действия</p><button><FileSearch size={17} /><span>Проверить правила конкурса КБР</span></button><button><BriefcaseBusiness size={17} /><span>Открыть профиль проекта</span></button><button><Landmark size={17} /><span>Найти меры поддержки</span></button></div></motion.div></div>}
    </main>
  );
}

function Brand() { return <div className="mb-8 flex items-center gap-3 px-2"><div className="brand-mark"><Network size={19} /></div><div><p className="text-sm font-semibold">GovIntelligence</p><p className="text-xs text-mist">Decision operating system</p></div></div>; }
function SectionHead({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) { return <div className="section-head"><div><p className="eyebrow">{eyebrow}</p><h3 className="section-title">{title}</h3></div><div className="text-signal">{icon}</div></div>; }
function LensCard({ name, value }: { name: string; value: number }) { const tone = value >= 70 ? "bg-signal" : value >= 50 ? "bg-amber" : "bg-danger"; return <div className="lens-card"><div><span>{name}</span><small>{value}%</small></div><div className="progress-track"><div data-progress className={tone} style={{ width: `${value}%` }} /></div></div>; }
function BriefBlock({ title, icon, items }: { title: string; icon: React.ReactNode; items: readonly string[] }) { return <div className="brief-block"><div className="brief-block-title">{icon}<span>{title}</span></div>{items.map((item) => <p key={item}><span />{item}</p>)}</div>; }
