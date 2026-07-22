export const statusLabels: Record<string, string> = {
  active: "Работает",
  ready: "Готово",
  waiting: "Ожидает данных",
  needs_data: "Нужны данные",
  match: "Подходит",
  mismatch: "Не подходит в текущей форме",
  insufficient_data: "Недостаточно данных",
  manual_review: "Нужна проверка",
  open: "Приём открыт",
  planned: "Запланировано",
  closed: "Приём закрыт",
  permanent: "Действует постоянно",
  unknown: "Статус уточняется",
  completed: "Завершено",
  completed_with_errors: "Завершено с замечаниями",
  failed: "Есть ошибка",
  running: "В работе",
  pending: "Ожидает запуска",
  partial: "Частично готово",
  verified: "Подтверждено",
  unverified: "Не подтверждено",
  inferred: "Определено системой",
  uploaded: "Загружено",
  queued: "В очереди",
  processing: "Обрабатывается",
  parsed: "Разобрано",
  needs_ocr: "Требуется распознавание",
  unsupported: "Формат не поддержан",
  skipped: "Пропущено",
  blocked: "Заблокировано",
  preliminary: "Предварительная оценка",
  mention: "Упоминание",
  opportunity_candidate: "Кандидат на возможность",
  verified_measure: "Проверенная мера",
  project_match: "Сопоставлено с проектом",
  actionable_opportunity: "Можно действовать",
  not_actionable: "Пока не является возможностью",
  needs_verification: "Нужно подтвердить",
  actionable: "Доступно действие",
  rejected: "Отклонено",
  matched: "Выполнено",
  missing: "Не хватает данных",
  healthy: "Работает",
  degraded: "Работает нестабильно",
  retry: "Повторная проверка",
};

export const typeLabels: Record<string, string> = {
  grant: "Грант",
  subsidy: "Субсидия",
  loan: "Льготный кредит",
  leasing: "Льготный лизинг",
  guarantee: "Гарантия",
  tax: "Налоговая льгота",
  land: "Земля",
  property: "Имущество",
  infrastructure: "Инфраструктура",
  export: "Экспортная поддержка",
  consulting: "Консультационная поддержка",
  federal: "Федеральный уровень",
  regional: "Региональный уровень",
  municipal: "Муниципальный уровень",
  new_document: "Новый документ",
  amended: "Документ изменён",
  status_change: "Изменился статус",
  deadline_change: "Изменился срок",
  funding_change: "Изменилось финансирование",
  policy: "Изменение политики",
  support: "Мера поддержки",
  priority: "Государственный приоритет",
  territorial: "Территориальный фактор",
};

export function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

export function label(value: unknown, fallback = "Уточняется") {
  const source = text(value, "");
  return statusLabels[source] ?? typeLabels[source] ?? (source.replaceAll("_", " ") || fallback);
}

export function dateLabel(value: unknown) {
  const source = text(value, "");
  if (!source) return "Дата не указана";
  const date = new Date(source);
  return Number.isNaN(date.getTime())
    ? source
    : date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export function confidencePercent(value: unknown) {
  const source = numberValue(value);
  return Math.round(source <= 1 ? source * 100 : source);
}

export function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString("ru-RU");
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map(displayValue).filter((item) => item !== "—").join(", ") || "—";

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const amount = numberValue(object.amount, Number.NaN);
    if (Number.isFinite(amount)) {
      const currency = text(object.currency, "");
      return `${amount.toLocaleString("ru-RU")} ${currency === "RUB" ? "₽" : currency}`.trim();
    }

    const primary = [
      object.label,
      object.name,
      object.value,
      object.normalized,
      object.legal_form,
      object.region,
      object.raw,
    ].find((item) => typeof item === "string" && item.trim());

    if (typeof primary === "string") return primary.trim();

    const simpleEntries = Object.entries(object)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .slice(0, 3)
      .map(([key, item]) => `${humanizeKey(key)}: ${displayValue(item)}`);

    return simpleEntries.join(" · ") || "Данные сохранены";
  }

  return "—";
}

export function humanizeKey(value: string) {
  const known: Record<string, string> = {
    legal_form: "Форма заявителя",
    normalized: "Нормализовано",
    region: "Регион",
    amount: "Сумма",
    currency: "Валюта",
    source_document_id: "Первичный документ",
  };
  return known[value] ?? value.replaceAll("_", " ");
}

export type FriendlySourceError = {
  title: string;
  detail: string;
  category: string;
  url: string | null;
  technical: string;
};

export function friendlySourceError(failure: Record<string, unknown>): FriendlySourceError {
  const raw = text(failure.error, text(failure.error_message, ""));
  const metadata = failure.metadata && typeof failure.metadata === "object"
    ? failure.metadata as Record<string, unknown>
    : {};
  const explicitType = text(failure.error_type, text(metadata.error_type, ""));
  const normalized = `${explicitType} ${raw}`.toLowerCase();
  const url = raw.match(/https?:\/\/[^\]\s)]+/)?.[0] ?? null;

  if (normalized.includes("timeout") || normalized.includes("aborted")) {
    return {
      title: "Источник не ответил вовремя",
      detail: "Система повторит проверку автоматически. Это не влияет на уже сохранённые документы.",
      category: "Тайм-аут",
      url,
      technical: raw,
    };
  }

  if (normalized.includes("dns") || normalized.includes("lookup address")) {
    return {
      title: "Адрес источника временно не найден",
      detail: "Проверяем основной адрес и резервные официальные точки доступа.",
      category: "Адрес сайта",
      url,
      technical: raw,
    };
  }

  if (normalized.includes("certificate") || normalized.includes("tls") || normalized.includes("unknownissuer")) {
    return {
      title: "Не удалось подтвердить сертификат сайта",
      detail: "Источник не используется для юридических выводов до безопасного подключения.",
      category: "Сертификат",
      url,
      technical: raw,
    };
  }

  if (normalized.includes("403") || normalized.includes("forbidden") || normalized.includes("blocked")) {
    return {
      title: "Источник ограничил автоматический доступ",
      detail: "Для него нужен официальный API, RSS, реестр или отдельный разрешённый адаптер.",
      category: "Ограничение доступа",
      url,
      technical: raw,
    };
  }

  return {
    title: "Источник временно недоступен",
    detail: "Ошибка сохранена в журнале и будет проверена повторно.",
    category: "Сетевая ошибка",
    url,
    technical: raw,
  };
}
