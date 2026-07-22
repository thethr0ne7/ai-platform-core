"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FileSearch, LoaderCircle, RefreshCw, X } from "lucide-react";
import {
  listProjectFactCandidates,
  reviewProjectFactCandidate,
  type ProjectFactCandidate,
} from "../lib/telegram";

export function ProjectFactReview({
  projectId,
  onFactsChanged,
}: {
  projectId: string;
  onFactsChanged?: () => void;
}) {
  const [candidates, setCandidates] = useState<ProjectFactCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [message, setMessage] = useState("Ищем факты в разобранных документах…");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProjectFactCandidates(projectId);
      setCandidates(result.candidates);
      const pending = result.candidates.filter((item) => item.status === "pending_confirmation").length;
      setMessage(pending
        ? `Нужно проверить найденных фактов: ${pending}.`
        : "Новых фактов для проверки пока нет.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить найденные факты.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(candidate: ProjectFactCandidate, decision: "confirmed" | "rejected") {
    setReviewingId(candidate.id);
    try {
      await reviewProjectFactCandidate(candidate.id, decision);
      setCandidates((current) => current.map((item) => item.id === candidate.id
        ? { ...item, status: decision }
        : item));
      setMessage(decision === "confirmed"
        ? "Факт подтверждён и добавлен в профиль проекта."
        : "Факт отклонён и не будет использоваться в расчётах.");
      onFactsChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение.");
    } finally {
      setReviewingId(null);
    }
  }

  const pending = candidates.filter((item) => item.status === "pending_confirmation");
  const confirmed = candidates.filter((item) => item.status === "confirmed").length;
  const rejected = candidates.filter((item) => item.status === "rejected").length;

  return (
    <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[.02] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium"><FileSearch className="text-signal" size={18} /> Факты из документов</div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-mist">
            Система только предлагает факты. В профиль и расчёты они попадают после вашего подтверждения.
          </p>
        </div>
        <button className="secondary-cta justify-center" disabled={loading || Boolean(reviewingId)} onClick={() => void load()}>
          {loading ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Обновить
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-mist">
        {message} · Подтверждено: {confirmed} · Отклонено: {rejected}
      </div>

      <div className="mt-4 space-y-3">
        {pending.map((candidate) => {
          const busy = reviewingId === candidate.id;
          const source = candidate.gi_project_documents?.file_name ?? "Документ";
          return (
            <article key={candidate.id} className="rounded-[20px] border border-white/[.08] bg-white/[.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{candidate.fact_label}</h3>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-mist">
                  уверенность {Math.round(Number(candidate.confidence) * 100)}%
                </span>
              </div>
              <p className="mt-2 break-words text-sm leading-6">{displayValue(candidate.value)}</p>
              <blockquote className="mt-3 rounded-xl border-l-2 border-signal/60 bg-black/15 p-3 text-xs leading-5 text-mist">
                {candidate.quote}
              </blockquote>
              <p className="mt-2 text-[11px] text-mist">{source} · {candidate.locator}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="secondary-cta justify-center" disabled={busy || Boolean(reviewingId)} onClick={() => void review(candidate, "rejected")}>
                  {busy ? <LoaderCircle className="animate-spin" size={15} /> : <X size={15} />} Отклонить
                </button>
                <button className="primary-cta justify-center" disabled={busy || Boolean(reviewingId)} onClick={() => void review(candidate, "confirmed")}>
                  {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} Подтвердить
                </button>
              </div>
            </article>
          );
        })}
        {!loading && pending.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-white/15 p-5 text-sm leading-6 text-mist">
            Все найденные факты проверены или документы ещё обрабатываются.
          </div>
        )}
      </div>
    </section>
  );
}

function displayValue(value: Record<string, unknown>) {
  if (typeof value.value === "string" || typeof value.value === "number") return String(value.value);
  if (typeof value.amount === "number") return `${value.amount.toLocaleString("ru-RU")} ${value.currency === "RUB" ? "₽" : String(value.currency ?? "")}`.trim();
  if (typeof value.raw === "string") return value.raw;
  return JSON.stringify(value);
}
