"use client";

import { motion } from "motion/react";
import {
  AlertTriangle, ArrowRight, Bell, BookOpen, Bot, BrainCircuit, BriefcaseBusiness,
  CalendarClock, CheckCircle2, ChevronRight, CircleHelp, FileSearch, Gauge,
  GitBranch, Landmark, Menu, Network, Radar, Search, ShieldCheck, X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const modes = [
  [Gauge, "Принять решение"],
  [FileSearch, "Проверить информацию"],
  [Radar, "Следить за изменениями"],
  [BrainCircuit, "Посмотреть прогноз"],
  [GitBranch, "Открыть базу знаний"]
] as const;

const officialDocuments = [
  {
    id: "law-318",
    title: "Правовая основа сельского туризма",
    kind: "Федеральный закон",
    status: "Официально опубликован",
    authority: "Российская Федерация",
    document: "Федеральный закон от 02.07.2021 № 318-ФЗ",
    registration: "Номер опубликования 0001202107020026",
    published: "2 июля 2021 года",
    fact: "Закон внес изменения в законодательство о туристской деятельности и развитии сельского хозяйства, закрепив правовую основу сельского туризма.",
    source: "https://publication.pravo.gov.ru/Document/View/0001202107020026"
  },
  {
    id: "order-228",
    title: "Порядок конкурсного отбора проектов сельского туризма",
    kind: "Приказ Минсельхоза России",
    status: "Действующая редакция требует проверки",
    authority: "Министерство сельского хозяйства Российской Федерации",
    document: "Приказ от 08.04.2025 № 228",
    registration: "Зарегистрирован 10.07.2025 № 82874; номер опубликования 0001202507110011",
    published: "11 июля 2025 года",
    fact: "Документ изменил порядок конкурсного отбора проектов развития сельского туризма, утверждённый приказом Минсельхоза России № 68.",
    source: "https://publication.pravo.gov.ru/documents/block/foiv266?index=3"
  },
  {
    id: "order-88",
    title: "Перечни затрат по гранту «Агротуризм»",
    kind: "Приказ Минсельхоза России",
    status: "Официально опубликован",
    authority: "Министерство сельского хозяйства Российской Федерации",
    document: "Приказ от 17.02.2026 № 88",
    registration: "Зарегистрирован 24.03.2026 № 85694; номер опубликования 0001202603250013",
    published: "25 марта 2026 года",
    fact: "Приказ утвердил перечень затрат, которые допускается финансировать за счёт гранта «Агротуризм», а также перечень затрат на имущество, работы и услуги для развития сельского туризма.",
    source: "https://publication.pravo.gov.ru/search?DocumentDateFrom=26.03.2025&DocumentDateTo=21.03.2026&SignatoryAuthorityId=9cfe6042-6bc2-449a-8190-779123113d73"
  },
  {
    id: "order-617",
    title: "Требования к средствам размещения в сельском туризме",
    kind: "Приказ Минэкономразвития России",
    status: "Официально опубликован",
    authority: "Министерство экономического развития Российской Федерации",
    document: "Приказ от 11.11.2022 № 617",
    registration: "Зарегистрирован 29.11.2022 № 71204; номер опубликования 0001202211290046",
    published: "29 ноября 2022 года",
    fact: "Документ устанавливает требования к средствам размещения, используемым для оказания услуг сельского туризма в сельской местности.",
    source: "https://publication.pravo.gov.ru/documents/block/foiv294?index=10"
  }
] as const;

type OfficialDocument = (typeof officialDocuments)[number];
const firstDocument: OfficialDocument = officialDocuments[0];

const changes = [
  ["25.03.2026", "Опубликован приказ Минсельхоза России № 88", "Утверждены перечни допустимых затрат по гранту «Агротуризм»."],
  ["11.07.2025", "Изменён порядок конкурсного отбора", "Опубликован приказ Минсельхоза России № 228."],
  ["29.02.2024", "Изменены требования к средствам размещения", "Опубликован приказ Минэкономразвития России № 98."]
] as const;

export function DecisionOsWorkspace() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<string>(modes[0][1]);
  const [selectedId, setSelectedId] = useState<string>(firstDocument.id);
  const selected: OfficialDocument = useMemo(
    () => officialDocuments.find((item) => item.id === selectedId) ?? firstDocument,
    [selectedId]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="workspace-frame">
      <aside className="desktop-sidebar glass-surface">
        <Brand />
        <p className="sidebar-label">Рабочие разделы</p>
        <nav className="space-y-1 text-sm">{modes.map(([Icon, label]) => <button key={label} onClick={() => setActiveMode(label)} className={`nav-item ${activeMode === label ? "nav-active" : ""}`}><Icon size={17} /><span>{label}</span></button>)}</nav>
        <div className="runtime-card"><div className="mb-3 flex items-center gap-2 text-sm"><Bot size={16} className="text-signal" /> Контроль достоверности</div><p className="text-xs leading-5 text-mist">В интерфейс допускаются только записи с официальным источником, датой публикации и проверяемым статусом.</p><div className="mt-4 flex items-center gap-2 text-[11px] text-signal"><span className="signal-dot" /> Проверка включена</div></div>
      </aside>

      <section className="min-w-0 flex-1 pb-24 xl:pb-0">
        <header className="topbar glass-surface"><div className="flex min-w-0 items-center gap-3"><button className="icon-button xl:hidden" aria-label="Открыть меню"><Menu size={19} /></button><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.22em] text-mist">Система анализа / {activeMode}</p><h1 className="truncate text-sm font-semibold sm:text-base">Государственная поддержка сельского туризма</h1></div></div><button className="command-trigger" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Найти документ, меру поддержки или действие</span><kbd>Ctrl K</kbd></button><div className="flex items-center gap-2"><button className="icon-button hidden sm:grid" aria-label="Уведомления"><Bell size={17} /></button><button className="icon-button hidden sm:grid" aria-label="Справка"><CircleHelp size={17} /></button><button className="avatar">АК</button></div></header>
        <button className="mobile-context glass-surface md:hidden" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Быстрый поиск</span><kbd>Ctrl K</kbd></button>

        <div className="decision-strip glass-surface"><div><span className="signal-dot" /> Данные проверены по официальным публикациям</div><div className="hidden sm:flex">4 нормативных документа</div><div className="hidden lg:flex">Региональные правила КБР не загружены</div><button onClick={() => setSelectedId("order-88")}>Открыть документ <ArrowRight size={14} /></button></div>

        <div className="decision-grid">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="decision-hero glass-surface"><div className="hero-mesh" /><div className="relative z-10"><div className="status-pill"><AlertTriangle size={14} /> Решение по проекту не сформировано</div><p className="decision-question">Можно ли подавать заявку по проекту в КБР?</p><h2 className="hero-title"><span>Пока нельзя ответить достоверно.</span></h2><p className="hero-copy">Федеральная нормативная база найдена. Для итогового вывода не хватает действующего регионального порядка КБР, объявления конкретного отбора, данных заявителя, сметы и документов на земельный участок.</p><div className="mt-6 flex flex-wrap gap-2"><button className="primary-cta">Загрузить документы проекта <ArrowRight size={15} /></button><button className="secondary-cta">Открыть список недостающих данных</button></div></div><div className="decision-score"><div className="score-ring"><span className="text-3xl font-semibold">Нет</span><span className="text-[10px] uppercase tracking-[.18em] text-mist">итогового вывода</span></div><p>Процент уверенности не рассчитывается без полного набора источников.</p></div></motion.section>

          <section className="next-action-card glass-surface"><SectionHead eyebrow="Следующий шаг" title="Найти правила отбора в КБР" icon={<Landmark size={18} />} /><div className="action-priority"><span>01</span><div><p>Получить действующий региональный порядок и объявление конкурса</p><small>Без них нельзя подтвердить сроки, форму заявителя, размер поддержки и допустимые расходы.</small></div></div><button className="full-action">Начать проверку источников <ArrowRight size={15} /></button></section>

          <section className="evidence-explorer glass-surface"><SectionHead eyebrow="Официальные основания" title="Нормативные документы" icon={<ShieldCheck size={18} />} /><div className="evidence-layout"><div className="evidence-list">{officialDocuments.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`evidence-select ${selectedId === item.id ? "active" : ""}`}><span className="evidence-state verified" /><div><p>{item.title}</p><small>{item.kind} · {item.status}</small></div><ChevronRight size={15} /></button>)}</div><article className="evidence-detail"><div className="evidence-detail-head"><div><p className="eyebrow">Проверяемый факт</p><h3>{selected.fact}</h3></div><CheckCircle2 className="text-signal" size={24} /></div><dl><div><dt>Документ</dt><dd>{selected.document}</dd></div><div><dt>Орган</dt><dd>{selected.authority}</dd></div><div><dt>Регистрация</dt><dd>{selected.registration}</dd></div><div><dt>Опубликован</dt><dd>{selected.published}</dd></div></dl><a className="trace-button" href={selected.source} target="_blank" rel="noreferrer">Открыть официальный источник <ArrowRight size={14} /></a></article></div></section>

          <section className="timeline-card glass-surface"><SectionHead eyebrow="История изменений" title="Что менялось в регулировании" icon={<CalendarClock size={18} />} /><div className="timeline-list">{changes.map(([date, title, detail]) => <div className="timeline-row" key={title}><span className="timeline-dot signal" /><time>{date}</time><div><p>{title}</p><small>{detail}</small></div></div>)}</div><button className="text-action">Показать все изменения <ArrowRight size={14} /></button></section>

          <section className="brief-card glass-surface"><SectionHead eyebrow="Итог проверки" title="Что известно сейчас" icon={<BookOpen size={18} />} /><div className="brief-status"><AlertTriangle size={18} /><div><p>Статус: федеральная база найдена, региональная проверка не завершена</p><small>Это не отказ и не подтверждение права на поддержку.</small></div></div><div className="brief-columns"><BriefBlock title="Подтверждено" items={["Сельский туризм закреплён в федеральном законодательстве", "Существует федеральный порядок конкурсного отбора", "Опубликован перечень затрат по гранту «Агротуризм»"]} /><BriefBlock title="Не подтверждено" items={["Действующий отбор в КБР", "Соответствие заявителя требованиям", "Допустимость конкретной сметы и земельного участка"]} /></div></section>
        </div>
      </section>
    </div>

    <nav className="mobile-dock glass-surface xl:hidden" aria-label="Мобильная навигация">{modes.slice(0, 4).map(([Icon, label]) => <button key={label} onClick={() => setActiveMode(label)} className={activeMode === label ? "dock-active" : ""}><Icon size={18} /><span>{label}</span></button>)}</nav>

    {searchOpen && <div className="palette-backdrop" role="presentation" onMouseDown={() => setSearchOpen(false)}><motion.div initial={{ opacity: 0, scale: .98, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="command-palette glass-surface" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="palette-search"><Search size={18} /><input autoFocus placeholder="Найти документ, меру поддержки или действие..." /><button aria-label="Закрыть поиск" onClick={() => setSearchOpen(false)}><X size={18} /></button></div><div className="palette-section"><p>Рабочие разделы</p>{modes.map(([Icon, label]) => <button key={label} onClick={() => { setActiveMode(label); setSearchOpen(false); }}><Icon size={17} /><span>{label}</span><kbd>↵</kbd></button>)}</div><div className="palette-section"><p>Быстрые действия</p><button><FileSearch size={17} /><span>Найти правила конкурса КБР</span></button><button><BriefcaseBusiness size={17} /><span>Открыть сведения о проекте</span></button><button><Landmark size={17} /><span>Посмотреть меры поддержки</span></button></div></motion.div></div>}
  </main>;
}

function Brand() { return <div className="mb-8 flex items-center gap-3 px-2"><div className="brand-mark"><Network size={19} /></div><div><p className="text-sm font-semibold">Господдержка</p><p className="text-xs text-mist">Система проверки решений</p></div></div>; }
function SectionHead({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: ReactNode }) { return <div className="section-head"><div><p className="eyebrow">{eyebrow}</p><h3 className="section-title">{title}</h3></div><div className="text-signal">{icon}</div></div>; }
function BriefBlock({ title, items }: { title: string; items: readonly string[] }) { return <div className="brief-block"><div className="brief-block-title"><CheckCircle2 size={16} /><span>{title}</span></div>{items.map((item) => <p key={item}><span />{item}</p>)}</div>; }
