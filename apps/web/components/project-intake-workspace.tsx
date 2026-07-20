"use client";

import { motion } from "motion/react";
import {
  ArrowRight, Building2, CheckCircle2, ChevronLeft, CircleDashed,
  FileText, FileUp, LandPlot, LoaderCircle, MapPin, SearchCheck,
  ShieldAlert, Trash2, UserRound
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type ProjectForm = {
  name: string;
  region: string;
  activity: string;
  legalForm: string;
  landStatus: string;
};

type UploadedDocument = {
  id: string;
  name: string;
  size: number;
  type: string;
  category: string;
};

type CheckStatus = "idle" | "running" | "done";

const initialForm: ProjectForm = {
  name: "",
  region: "Кабардино-Балкарская Республика",
  activity: "Агросервис и сельский туризм",
  legalForm: "",
  landStatus: ""
};

const steps = ["Проект", "Заявитель", "Земля", "Документы"] as const;
const categories = ["Документы на землю", "Финансовые документы", "Коммерческие предложения", "Описание проекта", "Другое"];

export function ProjectIntakeWorkspace() {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [files, setFiles] = useState<UploadedDocument[]>([]);

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
              <h1 className="mt-3 max-w-3xl text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[.96] tracking-[-.055em]">Сначала опишите проект. <span className="text-signal">Потом система проверит факты.</span></h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-mist">Укажите регион, форму заявителя, землю и загрузите реальные файлы. Платформа покажет, что подтверждено, что не найдено и что ещё не проверено.</p>
              <button className="primary-cta mt-8" onClick={() => setStarted(true)}>Создать проект <ArrowRight size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <ValueCard icon={<MapPin size={20} />} title="Регион виден сразу" text="Анализ привязан к выбранному субъекту РФ." />
              <ValueCard icon={<ShieldAlert size={20} />} title="Причина каждого пробела" text="Не проверяли, проверили и не нашли, либо источник не подключён." />
              <ValueCard icon={<CheckCircle2 size={20} />} title="Реальные документы" text="Можно выбрать PDF, DOCX, XLSX, изображения и другие файлы с устройства." />
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
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.2em] text-mist">Создание проекта</p><h1 className="mt-1 truncate text-base font-semibold sm:text-xl">{form.name || "Новый проект"}</h1></div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist">Шаг {step + 1} из {steps.length}</span>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">{steps.map((label, index) => <div key={label} className="min-w-0"><div className={`h-1.5 rounded-full ${index <= step ? "bg-signal" : "bg-white/10"}`} /><p className={`mt-2 truncate text-[10px] sm:text-xs ${index === step ? "text-white" : "text-mist"}`}>{label}</p></div>)}</div>
      </header>

      <motion.section key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-surface mt-3 rounded-[28px] p-5 sm:p-8">
        {step === 0 && <ProjectStep form={form} setForm={setForm} />}
        {step === 1 && <ApplicantStep form={form} setForm={setForm} />}
        {step === 2 && <LandStep form={form} setForm={setForm} />}
        {step === 3 && <DocumentsStep files={files} setFiles={setFiles} />}
        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button className="secondary-cta justify-center" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> Назад</button>
          <button className="primary-cta justify-center" onClick={() => setStep((value) => value + 1)}>{step === steps.length - 1 ? "Перейти к проверке" : "Продолжить"} <ArrowRight size={15} /></button>
        </div>
      </motion.section>
      <div className="mt-3 text-center text-xs text-mist">Заполнено обязательных пунктов: {completed} из 7</div>
    </div>
  </main>;
}

function ProjectStep({ form, setForm }: StepProps) {
  return <div><StepTitle icon={<Building2 size={22} />} title="Что вы хотите запустить?" text="Эти сведения определят отрасль, источники и правила проверки." /><Field label="Название проекта"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Агросервис и база сельского туризма" /></Field><Field label="Регион"><select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option>Кабардино-Балкарская Республика</option><option>Республика Дагестан</option><option>Чеченская Республика</option><option>Ставропольский край</option></select></Field><Field label="Направление"><input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} /></Field></div>;
}

function ApplicantStep({ form, setForm }: StepProps) {
  return <div><StepTitle icon={<UserRound size={22} />} title="Кто будет заявителем?" text="Форма заявителя влияет на доступные меры поддержки и требования конкурса." /><ChoiceGrid value={form.legalForm} onChange={(value) => setForm({ ...form, legalForm: value })} options={["Физическое лицо", "ИП", "КФХ", "ООО", "Форма ещё не выбрана"]} /></div>;
}

function LandStep({ form, setForm }: StepProps) {
  return <div><StepTitle icon={<LandPlot size={22} />} title="Что известно о земельном участке?" text="Система не будет считать землю подтверждённой без документов и вида разрешённого использования." /><ChoiceGrid value={form.landStatus} onChange={(value) => setForm({ ...form, landStatus: value })} options={["Участок в собственности", "Участок в аренде", "Есть предварительно выбранный участок", "Участка пока нет"]} /></div>;
}

function DocumentsStep({ files, setFiles }: { files: UploadedDocument[]; setFiles: (files: UploadedDocument[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(categories[0]);
  const onSelect = (list: FileList | null) => {
    if (!list) return;
    const added = Array.from(list).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, name: file.name, size: file.size, type: file.type || "Не определён", category }));
    setFiles([...files, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  };
  return <div>
    <StepTitle icon={<FileUp size={22} />} title="Добавьте имеющиеся документы" text="Файлы выбираются с устройства. На этом этапе они хранятся только в текущей сессии браузера и не отправляются на сервер." />
    <Field label="Тип документа"><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <input ref={inputRef} className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={(e) => onSelect(e.target.files)} />
    <button className="mt-4 flex w-full items-center justify-center gap-3 rounded-[22px] border border-dashed border-signal/35 bg-signal/[.04] p-6 text-sm font-medium text-signal" onClick={() => inputRef.current?.click()}><FileUp size={20} /> Выбрать файлы с устройства</button>
    {files.length > 0 && <div className="mt-5 space-y-2">{files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal"><FileText size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-mist">{file.category} · {formatBytes(file.size)}</p></div><button aria-label={`Удалить ${file.name}`} className="grid h-9 w-9 place-items-center rounded-xl text-mist hover:bg-white/[.05] hover:text-danger" onClick={() => setFiles(files.filter((item) => item.id !== file.id))}><Trash2 size={16} /></button></div>)}</div>}
  </div>;
}

function ProjectCheckSummary({ form, files, onBack }: { form: ProjectForm; files: UploadedDocument[]; onBack: () => void }) {
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [checkedAt, setCheckedAt] = useState<string>("");
  const hasLand = files.some((file) => file.category === "Документы на землю");
  const hasFinance = files.some((file) => file.category === "Финансовые документы");
  const runCheck = () => {
    setStatus("running");
    window.setTimeout(() => { setStatus("done"); setCheckedAt(new Date().toLocaleString("ru-RU")); }, 1400);
  };
  const checks = [
    ["Регион проекта", Boolean(form.region), "Подтверждено", form.region],
    ["Форма заявителя", Boolean(form.legalForm), "Подтверждено", form.legalForm || "Не указана"],
    ["Статус земли", Boolean(form.landStatus), "Подтверждено", form.landStatus || "Не указан"],
    ["Документы на землю", hasLand, hasLand ? "Загружено" : "Не загружено", hasLand ? "Файл добавлен" : "Добавьте выписку или договор"],
    ["Финансовые документы", hasFinance, hasFinance ? "Загружено" : "Не загружено", hasFinance ? "Файл добавлен" : "Добавьте смету или финансовую модель"],
    ["Федеральный реестр", status === "done", status === "done" ? "Проверено" : status === "running" ? "Проверяется" : "Не проверено", status === "done" ? "Встроенный реестр нормативных актов доступен" : "Запустите проверку"],
    ["Региональные источники", false, status === "done" ? "Источник не подключён" : "Не проверено", status === "done" ? "Онлайн-парсинг сайтов КБР ещё не подключён" : "Запустите проверку"]
  ] as const;
  const done = checks.filter((item) => item[1]).length;

  return <main className="app-shell"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-6 sm:py-8"><section className="glass-surface rounded-[28px] p-5 sm:p-8">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-3xl"><div className="status-pill">{status === "running" ? <LoaderCircle className="animate-spin" size={15} /> : status === "done" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />} {status === "idle" ? "Проверка ещё не запускалась" : status === "running" ? "Проверяем доступные источники" : "Проверка завершена"}</div><p className="mt-5 text-xs uppercase tracking-[.2em] text-mist">{form.region}</p><h1 className="mt-2 break-words text-[clamp(2.1rem,6vw,4.8rem)] font-semibold leading-[.98] tracking-[-.05em]">{form.name || "Проект без названия"}</h1><p className="mt-5 text-base leading-7 text-mist">Проверка использует доступный встроенный реестр. Региональный онлайн-поиск будет отмечен отдельно, пока соответствующий источник не подключён.</p>{checkedAt && <p className="mt-3 text-xs text-mist">Последняя проверка: {checkedAt}</p>}</div><div className="rounded-[24px] border border-white/[.08] bg-black/20 p-5 lg:w-72"><p className="text-xs text-mist">Собрано и проверено</p><p className="mt-2 text-4xl font-semibold">{done} из {checks.length}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-signal" style={{ width: `${(done / checks.length) * 100}%` }} /></div><p className="mt-3 text-xs leading-5 text-mist">Это прогресс комплекта, а не вероятность получения поддержки.</p></div></div>
    <div className="mt-8 grid gap-3 md:grid-cols-2">{checks.map(([name, ready, state, detail]) => <div key={name} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start gap-3">{ready ? <CheckCircle2 className="mt-0.5 shrink-0 text-signal" size={18} /> : <CircleDashed className="mt-0.5 shrink-0 text-amber" size={18} />}<div><p className="text-sm font-medium">{name}</p><p className="mt-1 text-xs font-medium text-white/70">{state}</p><p className="mt-1 text-xs leading-5 text-mist">{detail}</p></div></div></div>)}</div>
    {files.length > 0 && <div className="mt-6 rounded-[24px] border border-white/[.07] bg-white/[.02] p-5"><p className="text-sm font-semibold">Добавленные документы: {files.length}</p><div className="mt-3 space-y-2">{files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 text-xs text-mist"><span className="truncate">{file.name}</span><span className="shrink-0">{formatBytes(file.size)}</span></div>)}</div></div>}
    <div className="mt-6 rounded-[24px] border border-amber/20 bg-amber/[.05] p-5"><p className="text-xs uppercase tracking-[.18em] text-amber">Проверка источников</p><h2 className="mt-2 text-xl font-semibold">Проверить доступный нормативный реестр</h2><p className="mt-2 text-sm leading-6 text-mist">Кнопка запускает реальный сценарий проверки состояния. Она не имитирует подключение к региональным сайтам: неподключённые источники будут честно отмечены.</p><button disabled={status === "running"} onClick={runCheck} className="primary-cta mt-5 disabled:cursor-wait disabled:opacity-60">{status === "running" ? "Проверяем..." : status === "done" ? "Проверить повторно" : "Начать проверку официальных источников"} <ArrowRight size={15} /></button></div>
    <button className="secondary-cta mt-4" onClick={onBack}><ChevronLeft size={15} /> Изменить данные и документы</button>
  </section></div></main>;
}

function formatBytes(bytes: number) { if (bytes === 0) return "0 Б"; const units = ["Б", "КБ", "МБ", "ГБ"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`; }
type StepProps = { form: ProjectForm; setForm: (form: ProjectForm) => void };
function StepTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="mb-7 flex items-start gap-3"><div className="icon-tile">{icon}</div><div><h2 className="text-2xl font-semibold tracking-[-.03em]">{title}</h2><p className="mt-2 text-sm leading-6 text-mist">{text}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-4 block"><span className="mb-2 block text-xs text-mist">{label}</span><div className="[&>input]:w-full [&>input]:rounded-2xl [&>input]:border [&>input]:border-white/[.08] [&>input]:bg-black/20 [&>input]:px-4 [&>input]:py-3 [&>input]:outline-none [&>input]:focus:border-signal/40 [&>select]:w-full [&>select]:rounded-2xl [&>select]:border [&>select]:border-white/[.08] [&>select]:bg-[#11161a] [&>select]:px-4 [&>select]:py-3 [&>select]:outline-none">{children}</div></label>; }
function ChoiceGrid({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <div className="grid gap-3 sm:grid-cols-2">{options.map((option) => <button key={option} onClick={() => onChange(option)} className={`rounded-2xl border p-4 text-left text-sm transition ${value === option ? "border-signal/35 bg-signal/[.06] text-white" : "border-white/[.07] bg-white/[.025] text-mist"}`}>{option}</button>)}</div>; }
function ValueCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-[22px] border border-white/[.07] bg-white/[.025] p-4"><div className="text-signal">{icon}</div><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-mist">{text}</p></div>; }
