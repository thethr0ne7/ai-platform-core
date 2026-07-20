"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { animate, motion } from "motion/react";
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, Bell, Bot, BriefcaseBusiness,
  CircleHelp, FileSearch, Gauge, Home, Landmark, MapPinned, Menu, Network,
  Search, ShieldCheck, Sparkles, Target, WalletCards
} from "lucide-react";
import { useEffect } from "react";

const lenses = [
  ["Стратегия", 72], ["Территория", 88], ["Экономика", 54], ["Финансы", 38],
  ["Право", 31], ["Поддержка", 46], ["Производство", 81], ["Логистика", 64],
  ["Рынок", 58], ["Клиенты", 44], ["Доказательства", 67], ["Документы", 52],
  ["Риски", 41], ["Прогноз", 36]
] as const;

const evidence = [
  { title: "Карта доходности агросервиса КБР", type: "Проектный документ", state: "Проверено" },
  { title: "Письма о намерениях фермеров", type: "Рыночное доказательство", state: "Нужно собрать" },
  { title: "Правила регионального конкурса", type: "Официальный документ", state: "Не найдено" }
] as const;

const navigation = [
  [Gauge, "Главная"], [BriefcaseBusiness, "Проект"], [Landmark, "Поддержка"],
  [FileSearch, "Документы"], [ShieldCheck, "Доказательства"], [MapPinned, "Карта"]
] as const;

export function IntelligenceWorkspace() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate("[data-progress]", { scaleX: [0, 1] }, { duration: 0.7, delay: 0.05 });
  }, []);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="workspace-frame">
        <aside className="desktop-sidebar glass-surface">
          <Brand />
          <nav className="space-y-1 text-sm">
            {navigation.map(([Icon, label], index) => <button key={label} className={`nav-item ${index === 0 ? "nav-active" : ""}`}><Icon size={17} /><span>{label}</span></button>)}
          </nav>
          <div className="runtime-card">
            <div className="mb-3 flex items-center gap-2 text-sm"><Bot size={16} className="text-signal" /> Factory Runtime</div>
            <p className="text-xs leading-5 text-mist">Evidence Lock, Intelligence Lenses и Quality Gates активны.</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-signal"><span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_14px_rgba(78,255,167,.8)]" /> Система активна</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 pb-24 xl:pb-0">
          <header className="topbar glass-surface">
            <div className="flex min-w-0 items-center gap-3">
              <button className="icon-button xl:hidden" aria-label="Открыть меню"><Menu size={19} /></button>
              <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.22em] text-mist">Проект / КБР</p><h1 className="truncate text-sm font-semibold sm:text-base">Агросервис: техника → производство → агротуризм</h1></div>
            </div>
            <div className="hidden min-w-[280px] max-w-xl flex-1 md:block"><div className="search-shell"><Search size={16} /><span>Поиск мер поддержки, документов, программ...</span><kbd>⌘ K</kbd></div></div>
            <div className="flex items-center gap-2"><button className="icon-button hidden sm:grid"><Bell size={17} /></button><button className="icon-button hidden sm:grid"><CircleHelp size={17} /></button><button className="avatar">АК</button></div>
          </header>

          <div className="mobile-context glass-surface md:hidden"><Search size={16} /><span>Поиск по платформе</span></div>

          <div className="decision-strip glass-surface">
            <div><span className="signal-dot" /> Анализ обновлён</div>
            <div className="hidden sm:block">8 подтверждённых фактов</div>
            <div className="hidden lg:block">3 критических пробела</div>
            <button>Открыть трассировку <ArrowUpRight size={14} /></button>
          </div>

          <div className="bento-grid">
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="hero-bento glass-surface">
              <div className="hero-mesh" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
                <div>
                  <div className="status-pill"><AlertTriangle size={14} /> Требуются доказательства</div>
                  <h2 className="hero-title">Возможность сильная.<br /><span>Решение пока нельзя принимать уверенно.</span></h2>
                  <p className="hero-copy">Платформа обнаружила высокий потенциал территориального кластера и повторяемых операций, но не подтверждены актуальные правила господдержки и финансовая устойчивость.</p>
                  <div className="mt-6 flex flex-wrap gap-2"><button className="primary-cta">Собрать недостающие данные <ArrowUpRight size={15} /></button><button className="secondary-cta">Открыть Decision Brief</button></div>
                </div>
                <div className="score-ring"><span className="text-4xl font-semibold">62%</span><span className="text-[10px] uppercase tracking-[.18em] text-mist">готовность</span></div>
              </div>
              <div className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Покрытие доказательств" value="67%" note="8 из 12 ключевых фактов" />
                <Metric label="Критические блокеры" value="3" note="право, финансы, конкурс" />
                <Metric label="Возможности" value="4" note="кластер, спрос, повторяемость" />
                <Metric label="Интеллект-контуры" value="14" note="активно" />
              </div>
            </motion.section>

            <section className="actions-bento glass-surface"><SectionHead eyebrow="Next best actions" title="Следующие действия" icon={<Target size={18} />} /><div className="space-y-3"><Action index="1" title="Проверить правила конкурса" text="Найти актуальный порядок Минсельхоза КБР." urgent /><Action index="2" title="Собрать спрос" text="10–15 интервью и 5–10 писем о намерениях." /><Action index="3" title="Подтвердить экономику" text="Получить КП и проверить cash flow." /></div></section>

            <Tabs.Root defaultValue="lenses" className="lenses-bento glass-surface">
              <Tabs.List className="tabs-list" aria-label="Разделы аналитики"><Tabs.Trigger className="tab-trigger" value="lenses">Контуры</Tabs.Trigger><Tabs.Trigger className="tab-trigger" value="support">Поддержка</Tabs.Trigger><Tabs.Trigger className="tab-trigger" value="risks">Риски</Tabs.Trigger></Tabs.List>
              <Tabs.Content value="lenses" className="pt-5"><div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">14 контуров</p><h3 className="section-title">Карта готовности решения</h3></div><span className="text-xs text-mist">Сейчас</span></div><div className="lens-grid">{lenses.map(([name, value]) => <LensCard key={name} name={name} value={value} />)}</div></Tabs.Content>
              <Tabs.Content value="support" className="pt-5"><SupportCard /></Tabs.Content>
              <Tabs.Content value="risks" className="space-y-3 pt-5">{["Логистика свыше 40 км может снизить маржу", "Смета не подтверждена коммерческими предложениями", "Юридическая форма не сверена с порядком конкурса"].map((item) => <div key={item} className="risk-row"><AlertTriangle size={17} /><span>{item}</span></div>)}</Tabs.Content>
            </Tabs.Root>

            <section className="blockers-bento glass-surface"><SectionHead eyebrow="Decision blockers" title="Критические блокеры" icon={<AlertTriangle size={18} />} /><div className="space-y-3"><Blocker tone="danger" title="Региональный конкурс КБР" text="Правила конкурса не найдены или требуют обновления." /><Blocker tone="danger" title="Финансовая модель" text="Не подтверждены CAPEX, OPEX и денежный поток." /><Blocker tone="amber" title="Правовое соответствие" text="Требуется проверка формы КФХ/ООО и ограничений." /></div></section>

            <section className="support-bento glass-surface"><SectionHead eyebrow="Support matching" title="Подходящие меры поддержки" icon={<Landmark size={18} />} /><div className="space-y-3"><SupportRow title="Агростартап" source="Минсельхоз РФ" score={67} /><SupportRow title="Лизинг сельхозтехники" source="Росагролизинг" score={61} /><SupportRow title="Субсидии на технику" source="КБР" score={48} /></div></section>

            <section className="evidence-bento glass-surface"><SectionHead eyebrow="Evidence locker" title="Доказательства" icon={<BadgeCheck size={18} />} /><div className="space-y-3">{evidence.map((item) => <EvidenceRow key={item.title} {...item} />)}</div></section>

            <section className="finance-bento glass-surface"><div className="flex items-center gap-3"><div className="icon-tile"><WalletCards size={20} /></div><div><p className="text-sm font-medium">Финансовый контур</p><p className="text-xs text-mist">Критическое покрытие: 38%</p></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5"><div data-progress className="h-full origin-left rounded-full bg-amber" style={{ width: "38%" }} /></div><p className="mt-4 text-xs leading-5 text-mist">До решения нужны коммерческие предложения, сценарии загрузки и проверка кассового разрыва.</p></section>
          </div>
        </section>
      </div>

      <nav className="mobile-dock glass-surface xl:hidden" aria-label="Мобильная навигация">
        <button className="dock-active"><Home size={18} /><span>Главная</span></button>
        <button><BriefcaseBusiness size={18} /><span>Проект</span></button>
        <button><Landmark size={18} /><span>Поддержка</span></button>
        <button><ShieldCheck size={18} /><span>Evidence</span></button>
      </nav>
    </main>
  );
}

function Brand() { return <div className="mb-9 flex items-center gap-3 px-2"><div className="brand-mark"><Network size={19} /></div><div><p className="text-sm font-semibold">GovIntelligence</p><p className="text-xs text-mist">Decision operating system</p></div></div>; }
function SectionHead({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) { return <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">{eyebrow}</p><h3 className="section-title">{title}</h3></div><div className="text-signal">{icon}</div></div>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><p className="text-xs text-mist">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-mist">{note}</p></div>; }
function LensCard({ name, value }: { name: string; value: number }) { const tone = value >= 70 ? "bg-signal" : value >= 50 ? "bg-amber" : "bg-danger"; return <div className="lens-card"><div className="flex items-center justify-between"><span className="text-sm">{name}</span><span className="text-xs text-mist">{value}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div data-progress className={`h-full origin-left rounded-full ${tone}`} style={{ width: `${value}%` }} /></div></div>; }
function Action({ index, title, text, urgent = false }: { index: string; title: string; text: string; urgent?: boolean }) { return <button className="action-row"><span className={urgent ? "action-index urgent" : "action-index"}>{index}</span><span className="text-left"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-mist">{text}</span></span><ArrowUpRight size={16} className="ml-auto shrink-0 text-mist" /></button>; }
function Blocker({ tone, title, text }: { tone: "danger" | "amber"; title: string; text: string }) { return <div className={`blocker-row ${tone}`}><AlertTriangle size={17} /><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-mist">{text}</p></div></div>; }
function SupportRow({ title, source, score }: { title: string; source: string; score: number }) { return <div className="support-row"><div className="icon-tile"><Landmark size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{title}</p><p className="text-xs text-mist">{source}</p></div><span className="score-badge">{score}%</span></div>; }
function EvidenceRow({ title, type, state }: { title: string; type: string; state: string }) { const stateClass = state === "Проверено" ? "text-signal" : state === "Не найдено" ? "text-danger" : "text-amber"; return <div className="evidence-row"><FileSearch size={17} className="mt-0.5 shrink-0 text-mist" /><div><p className="text-sm">{title}</p><p className="mt-1 text-xs text-mist">{type}</p><p className={`mt-2 text-[10px] uppercase tracking-wider ${stateClass}`}>{state}</p></div></div>; }
function SupportCard() { return <div className="support-highlight"><div className="flex items-center gap-3"><div className="icon-tile"><Landmark size={19} /></div><div><p className="font-medium">Грант «Агротуризм»</p><p className="text-sm text-mist">Предварительное соответствие по целям проекта</p></div></div><p className="mt-4 text-sm leading-6 text-mist">Нужна проверка актуального конкурсного порядка, формы заявителя и допустимых расходов.</p></div>; }
