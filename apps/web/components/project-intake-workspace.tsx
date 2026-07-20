"use client";

import { motion } from "motion/react";
import {
  ArrowRight, Building2, CheckCircle2, ChevronLeft, CircleDashed,
  FileUp, LandPlot, MapPin, SearchCheck, ShieldAlert, UserRound
} from "lucide-react";
import { useMemo, useState } from "react";

type ProjectForm = {
  name: string;
  region: string;
  activity: string;
  legalForm: string;
  landStatus: string;
};

const initialForm: ProjectForm = {
  name: "",
  region: "Кабардино-Балкарская Республика",
  activity: "Агросервис и сельский туризм",
  legalForm: "",
  landStatus: ""
};

const steps = ["Проект", "Заявитель", "Земля", "Документы"] as const;

export function ProjectIntakeWorkspace() {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [files, setFiles] = useState<string[]>([]);

  const completed = useMemo(() => {
    const values = [form.name, form.region, form.activity, form.legalForm, form.landStatus];
    return values.filter(Boolean).length + Math.min(files.length, 2);
  }, [files.length, form]);

  if (!started) {
    return <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <section className="glass-surface overflow-hidden rounded-[30px] p-5 sm:p-8 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div>
              <div className="status-pill"><SearchCheck size={15} /> Проверка без выдуманных выводов</div>
              <p className="mt-6 text-xs uppercase tracking-[.2em] text-mist">Новый проект</p>
              <h1 className="mt-3 max-w-3xl text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[.96] tracking-[-.055em]">
                Сначала опишите проект. <span className="text-signal">Потом система проверит факты.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-mist">
                Укажите регион, форму заявителя, землю и загрузите документы. Платформа отделит найденное, отсутствующее и ещё не проверенное.
              </p>
              <button className="primary-cta mt-8" onClick={() => setStarted(true)}>Создать проект <ArrowRight size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <ValueCard icon={<MapPin size={20} />} title="Регион виден сразу" text="Пользователь понимает, почему анализ относится именно к выбранному субъекту РФ." />
              <ValueCard icon={<ShieldAlert size={20} />} title="Причина каждого пробела" text="Не проверяли, проверили и не нашли, либо документ ещё не опубликован." />
              <ValueCard icon={<CheckCircle2 size={20} />} title="Прогресс вместо фиктивного процента" text="Показываем, сколько обязательных данных уже собрано." />
            </div>
          </div>
        </section>
      </div>
    </main>;
  }

  if (step >= steps.length) {
    return <ProjectCheckSummary form={form} files={files} onBack={() => setStep(steps.length - 1)} />;
  }

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="mx-auto min-h-screen max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
      <header className="glass-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[.2em] text-mist">Создание проекта</p>
            <h1 className="mt-1 truncate text-base font-semibold sm:text-xl">{form.name || "Новый проект"}</h1>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist">Шаг {step + 1} из {steps.length}</span>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {steps.map((label, index) => <div key={label} className="min-w-0">
            <div className={`h-1.5 rounded-full ${index <= step ? "bg-signal" : "bg-white/10"}`} />
            <p className={`mt-2 truncate text-[10px] sm:text-xs ${index === step ? "text-white" : "text-mist"}`}>{label}</p>
          </div>)}
        </div>
      </header>

      <motion.section key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-surface mt-3 rounded-[28px] p-5 sm:p-8">
        {step === 0 && <ProjectStep form={form} setForm={setForm} />}
        {step === 1 && <ApplicantStep form={form} setForm={setForm} />}
        {step === 2 && <LandStep form={form} setForm={setForm} />}
        {step === 3 && <DocumentsStep files={files} setFiles={setFiles} />}

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button className="secondary-cta justify-center" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> Назад</button>
          <button className="primary-cta justify-center" onClick={() => setStep((value) => value + 1)}>{step === steps.length - 1 ? "Начать проверку" : "Продолжить"} <ArrowRight size={15} /></button>
        </div>
      </motion.section>

      <div className="mt-3 text-center text-xs text-mist">Заполнено обязательных пунктов: {completed} из 7</div>
    </div>
  </main>;
}

function ProjectStep({ form, setForm }: StepProps) {
  return <div>
    <StepTitle icon={<Building2 size={22} />} title="Что вы хотите запустить?" text="Эти сведения определят отрасль, источники и правила проверки." />
    <Field label="Название проекта"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Агросервис и база сельского туризма" /></Field>
    <Field label="Регион"><select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option>Кабардино-Балкарская Республика</option><option>Республика Дагестан</option><option>Чеченская Республика</option><option>Ставропольский край</option></select></Field>
    <Field label="Направление"><input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} /></Field>
  </div>;
}

function ApplicantStep({ form, setForm }: StepProps) {
  return <div>
    <StepTitle icon={<UserRound size={22} />} title="Кто будет заявителем?" text="Форма заявителя влияет на доступные меры поддержки и требования конкурса." />
    <ChoiceGrid value={form.legalForm} onChange={(value) => setForm({ ...form, legalForm: value })} options={["Физическое лицо", "ИП", "КФХ", "ООО", "Форма ещё не выбрана"]} />
  </div>;
}

function LandStep({ form, setForm }: StepProps) {
  return <div>
    <StepTitle icon={<LandPlot size={22} />} title="Что известно о земельном участке?" text="Система не будет считать землю подтверждённой без документов и вида разрешённого использования." />
    <ChoiceGrid value={form.landStatus} onChange={(value) => setForm({ ...form, landStatus: value })} options={["Участок в собственности", "Участок в аренде", "Есть предварительно выбранный участок", "Участка пока нет"]} />
  </div>;
}

function DocumentsStep({ files, setFiles }: { files: string[]; setFiles: (files: string[]) => void }) {
  const add = (name: string) => setFiles([...files, name]);
  return <div>
    <StepTitle icon={<FileUp size={22} />} title="Загрузите то, что уже есть" text="Документы не обязательны для старта, но без них итоговый вывод будет ограничен." />
    <div className="grid gap-3 sm:grid-cols-2">
      {["Выписка или договор на землю", "Смета или финансовая модель", "Коммерческие предложения", "Описание проекта"].map((name) => {
        const active = files.includes(name);
        return <button key={name} onClick={() => active ? setFiles(files.filter((item) => item !== name)) : add(name)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-signal/30 bg-signal/[.06]" : "border-white/[.07] bg-white/[.025]"}`}>
          <div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-signal/15 text-signal" : "bg-white/[.05] text-mist"}`}>{active ? <CheckCircle2 size={18} /> : <FileUp size={18} />}</span><span className="text-sm font-medium">{name}</span></div>
        </button>;
      })}
    </div>
  </div>;
}

function ProjectCheckSummary({ form, files, onBack }: { form: ProjectForm; files: string[]; onBack: () => void }) {
  const checks = [
    ["Регион проекта", Boolean(form.region), "Указан пользователем"],
    ["Форма заявителя", Boolean(form.legalForm), form.legalForm || "Не указана"],
    ["Статус земли", Boolean(form.landStatus), form.landStatus || "Не указан"],
    ["Документы на землю", files.includes("Выписка или договор на землю"), files.includes("Выписка или договор на землю") ? "Загружены" : "Не загружены"],
    ["Финансовые документы", files.includes("Смета или финансовая модель"), files.includes("Смета или финансовая модель") ? "Загружены" : "Не загружены"],
    ["Региональный порядок отбора", false, "Источник ещё не проверен"],
    ["Объявление действующего конкурса", false, "Источник ещё не проверен"]
  ] as const;
  const done = checks.filter((item) => item[1]).length;

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
      <section className="glass-surface rounded-[28px] p-5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="status-pill"><CircleDashed size={15} /> Проверка начата</div>
            <p className="mt-5 text-xs uppercase tracking-[.2em] text-mist">{form.region}</p>
            <h1 className="mt-2 text-[clamp(2.1rem,6vw,4.8rem)] font-semibold leading-[.98] tracking-[-.05em]">{form.name || "Проект без названия"}</h1>
            <p className="mt-5 text-base leading-7 text-mist">Главное действие сейчас — закрыть недостающие обязательные данные. Нормативный вывод появится только после проверки источников.</p>
          </div>
          <div className="rounded-[24px] border border-white/[.08] bg-black/20 p-5 lg:w-72">
            <p className="text-xs text-mist">Собрано обязательных данных</p><p className="mt-2 text-4xl font-semibold">{done} из {checks.length}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-signal" style={{ width: `${(done / checks.length) * 100}%` }} /></div>
            <p className="mt-3 text-xs leading-5 text-mist">Это прогресс комплекта, а не вероятность получения поддержки.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {checks.map(([name, ready, detail]) => <div key={name} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <div className="flex items-start gap-3">{ready ? <CheckCircle2 className="mt-0.5 shrink-0 text-signal" size={18} /> : <CircleDashed className="mt-0.5 shrink-0 text-amber" size={18} />}<div><p className="text-sm font-medium">{name}</p><p className="mt-1 text-xs leading-5 text-mist">{detail}</p></div></div>
          </div>)}
        </div>

        <div className="mt-6 rounded-[24px] border border-amber/20 bg-amber/[.05] p-5">
          <p className="text-xs uppercase tracking-[.18em] text-amber">Следующий шаг</p>
          <h2 className="mt-2 text-xl font-semibold">Проверить региональный порядок и действующий конкурс</h2>
          <p className="mt-2 text-sm leading-6 text-mist">После этого система сможет определить требования к заявителю, сроки, размер поддержки и допустимые расходы.</p>
          <button className="primary-cta mt-5">Начать проверку официальных источников <ArrowRight size={15} /></button>
        </div>

        <button className="secondary-cta mt-4" onClick={onBack}><ChevronLeft size={15} /> Изменить данные проекта</button>
      </section>
    </div>
  </main>;
}

type StepProps = { form: ProjectForm; setForm: (form: ProjectForm) => void };
function StepTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="mb-7 flex items-start gap-3"><div className="icon-tile">{icon}</div><div><h2 className="text-2xl font-semibold tracking-[-.03em]">{title}</h2><p className="mt-2 text-sm leading-6 text-mist">{text}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-4 block"><span className="mb-2 block text-xs text-mist">{label}</span><div className="[&>input]:w-full [&>input]:rounded-2xl [&>input]:border [&>input]:border-white/[.08] [&>input]:bg-black/20 [&>input]:px-4 [&>input]:py-3 [&>input]:outline-none [&>input]:focus:border-signal/40 [&>select]:w-full [&>select]:rounded-2xl [&>select]:border [&>select]:border-white/[.08] [&>select]:bg-[#11161a] [&>select]:px-4 [&>select]:py-3 [&>select]:outline-none">{children}</div></label>; }
function ChoiceGrid({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <div className="grid gap-3 sm:grid-cols-2">{options.map((option) => <button key={option} onClick={() => onChange(option)} className={`rounded-2xl border p-4 text-left text-sm transition ${value === option ? "border-signal/35 bg-signal/[.06] text-white" : "border-white/[.07] bg-white/[.025] text-mist"}`}>{option}</button>)}</div>; }
function ValueCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-[22px] border border-white/[.07] bg-white/[.025] p-4"><div className="text-signal">{icon}</div><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-mist">{text}</p></div>; }
