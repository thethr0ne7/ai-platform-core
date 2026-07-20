"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { animate, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  FileSearch,
  Gauge,
  Landmark,
  MapPinned,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards
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

export function IntelligenceWorkspace() {
  useEffect(() => {
    animate("[data-progress]", { scaleX: [0, 1] }, { duration: 0.8, delay: 0.1 });
  }, []);

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-[#0d0e10] px-5 py-6 xl:block">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-signal text-ink"><Network size={20} /></div>
            <div><p className="text-sm font-semibold">Government Intelligence</p><p className="text-xs text-mist">Decision operating system</p></div>
          </div>
          <nav className="space-y-1 text-sm">
            {[
              [Gauge, "Обзор решения"], [Target, "Проекты"], [Landmark, "Меры поддержки"],
              [FileSearch, "Документы"], [ShieldCheck, "Доказательства"], [MapPinned, "Карта возможностей"]
            ].map(([Icon, label], index) => {
              const C = Icon as typeof Gauge;
              return <button key={label as string} className={`nav-item ${index === 0 ? "nav-active" : ""}`}><C size={17} /><span>{label as string}</span></button>;
            })}
          </nav>
          <div className="mt-auto rounded-3xl border border-line bg-panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm"><Sparkles size={16} className="text-signal" /> AI Factory Runtime</div>
            <p className="text-xs leading-5 text-mist">Evidence Lock, Intelligence Lenses и Quality Gates активны.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-line bg-ink/90 px-5 backdrop-blur-xl md:px-8">
            <div><p className="text-xs uppercase tracking-[.22em] text-mist">Проект / КБР</p><h1 className="text-lg font-semibold">Агросервис: техника → производство → агротуризм</h1></div>
            <div className="flex items-center gap-3"><button className="icon-button"><Search size={18} /></button><button className="primary-button">Новый анализ <ArrowUpRight size={16} /></button></div>
          </header>

          <div className="grid gap-5 p-5 md:p-8 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="hero-card">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="max-w-3xl">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs text-amber"><AlertTriangle size={14} /> Требуются доказательства</div>
                    <h2 className="max-w-2xl text-3xl font-semibold leading-tight md:text-5xl">Возможность сильная. Решение пока нельзя принимать уверенно.</h2>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-mist md:text-base">Платформа обнаружила высокий потенциал территориального кластера и повторяемых операций, но не подтверждены актуальные правила господдержки и финансовая устойчивость.</p>
                  </div>
                  <div className="score-ring"><span className="text-3xl font-semibold">62</span><span className="text-[11px] uppercase tracking-widest text-mist">готовность</span></div>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <Metric label="Покрытие доказательств" value="67%" note="8 из 12 ключевых фактов" />
                  <Metric label="Критические блокеры" value="3" note="право, финансы, конкурс" />
                  <Metric label="Возможности" value="4" note="кластер, спрос, повторяемость" />
                </div>
              </motion.section>

              <Tabs.Root defaultValue="lenses" className="panel-card">
                <Tabs.List className="tabs-list" aria-label="Разделы аналитики">
                  <Tabs.Trigger className="tab-trigger" value="lenses">Интеллект-контуры</Tabs.Trigger>
                  <Tabs.Trigger className="tab-trigger" value="support">Меры поддержки</Tabs.Trigger>
                  <Tabs.Trigger className="tab-trigger" value="risks">Риски</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="lenses" className="pt-6">
                  <div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">14 контуров</p><h3 className="section-title">Карта готовности решения</h3></div><span className="text-xs text-mist">Обновлено сейчас</span></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {lenses.map(([name, value]) => <LensCard key={name} name={name} value={value} />)}
                  </div>
                </Tabs.Content>
                <Tabs.Content value="support" className="pt-6">
                  <SupportCard />
                </Tabs.Content>
                <Tabs.Content value="risks" className="pt-6">
                  <div className="space-y-3">
                    {["Логистика свыше 40 км может съесть маржу", "Смета не подтверждена коммерческими предложениями", "Юридическая форма не сверена с актуальным порядком конкурса"].map((item) => <div key={item} className="risk-row"><AlertTriangle size={17} /><span>{item}</span></div>)}
                  </div>
                </Tabs.Content>
              </Tabs.Root>

              <section className="panel-card">
                <div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">Opportunity map</p><h3 className="section-title">Что уже выглядит перспективно</h3></div><MapPinned className="text-signal" /></div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Opportunity title="Баксанский кластер" text="Высокая концентрация садов, повторяемые работы и короткое плечо логистики." />
                  <Opportunity title="Сезонные пакеты" text="Опрыскивание, междурядья и логистика дают повторную загрузку вместо разовых выездов." />
                  <Opportunity title="Письма о намерениях" text="Документы от фермеров усиливают грантовую заявку и переговоры по лизингу." />
                  <Opportunity title="Грант + лизинг" text="Комбинация может снизить стартовую нагрузку, если исключено двойное финансирование." />
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="panel-card">
                <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Next best actions</p><h3 className="section-title">Следующие действия</h3></div><Target className="text-signal" /></div>
                <div className="space-y-3">
                  <Action index="01" title="Проверить правила конкурса" text="Найти актуальный порядок Минсельхоза КБР и допустимые расходы." urgent />
                  <Action index="02" title="Собрать спрос" text="10–15 интервью и 5–10 писем о намерениях с гектар-операциями." />
                  <Action index="03" title="Подтвердить экономику" text="Получить КП на технику и проверить CAPEX, OPEX и cash flow." />
                </div>
              </section>

              <section className="panel-card">
                <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Evidence locker</p><h3 className="section-title">Доказательства</h3></div><BadgeCheck className="text-signal" /></div>
                <div className="space-y-3">
                  {evidence.map((item) => <EvidenceRow key={item.title} {...item} />)}
                </div>
              </section>

              <section className="panel-card overflow-hidden">
                <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5"><WalletCards size={20} /></div><div><p className="text-sm font-medium">Финансовый контур</p><p className="text-xs text-mist">Критическое покрытие: 38%</p></div></div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5"><div data-progress className="h-full origin-left rounded-full bg-amber" style={{ width: "38%" }} /></div>
                <p className="mt-4 text-xs leading-5 text-mist">До решения нужны коммерческие предложения, сценарии загрузки и проверка кассового разрыва.</p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><p className="text-xs text-mist">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-mist">{note}</p></div>;
}
function LensCard({ name, value }: { name: string; value: number }) {
  const tone = value >= 70 ? "bg-signal" : value >= 50 ? "bg-amber" : "bg-danger";
  return <div className="lens-card"><div className="flex items-center justify-between"><span className="text-sm">{name}</span><span className="text-xs text-mist">{value}%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"><div data-progress className={`h-full origin-left rounded-full ${tone}`} style={{ width: `${value}%` }} /></div></div>;
}
function Opportunity({ title, text }: { title: string; text: string }) {
  return <div className="opportunity-card"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><span className="h-2 w-2 rounded-full bg-signal" />{title}</div><p className="text-sm leading-6 text-mist">{text}</p></div>;
}
function Action({ index, title, text, urgent = false }: { index: string; title: string; text: string; urgent?: boolean }) {
  return <button className="action-row"><span className={urgent ? "action-index urgent" : "action-index"}>{index}</span><span className="text-left"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-mist">{text}</span></span><ArrowUpRight size={16} className="ml-auto shrink-0 text-mist" /></button>;
}
function EvidenceRow({ title, type, state }: { title: string; type: string; state: string }) {
  const stateClass = state === "Проверено" ? "text-signal" : state === "Не найдено" ? "text-danger" : "text-amber";
  return <div className="evidence-row"><FileSearch size={17} className="mt-0.5 shrink-0 text-mist" /><div><p className="text-sm">{title}</p><p className="mt-1 text-xs text-mist">{type}</p><p className={`mt-2 text-[11px] uppercase tracking-wider ${stateClass}`}>{state}</p></div></div>;
}
function SupportCard() {
  return <div className="rounded-3xl border border-signal/20 bg-signal/[.06] p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-signal">Potential match</p><h3 className="mt-2 text-2xl font-semibold">Грант «Агротуризм»</h3><p className="mt-3 max-w-xl text-sm leading-6 text-mist">Есть предметное совпадение по агротуризму и инфраструктуре, но право заявителя и перечень расходов требуют подтверждения актуальным официальным документом.</p></div><span className="rounded-full border border-signal/30 px-3 py-1 text-xs text-signal">46% fit</span></div></div>;
}
