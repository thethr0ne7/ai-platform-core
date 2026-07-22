"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FileSearch, LoaderCircle, RefreshCw, X } from "lucide-react";
import {
  listProjectFactCandidates,
  reviewProjectFactCandidate,
  type ProjectFactCandidate,
} from "../lib/telegram";
import { confidencePercent, displayValue } from "../lib/government-report-format";

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
        ? `Нужно проверить фактов: ${pending}.`
        : "Новых фактов для проверки пока нет.");
    } catch (error) {
      setMessage(friendlyFactError(error));
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
      setMessage(friendlyFactError(error));
    } finally {
      setReviewingId(null);
    }
  }

  const pending = candidates.filter((item) => item.status === "pending_confirmation");
  const confirmed = candidates.filter((item) => item.status === "confirmed").length;
  const rejected = candidates.filter((item) => item.status === "rejected").length;

  return (
    <section className="glass-surface mt-3 rounded-[28px] p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-start gap-3">
          <div className="brand-mark h-10 w-10 rounded-[16px]"><FileSearch size={18} /></div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-7">Факты из документов</h2>
            <p className="mt-1 text-xs leading-5 text-mist/45">Система предлагает значения, но использует их только после вашего подтверждения.</p>
          </div>
        </div>
        <button className="secondary-cta" disabled={loading || Boolean(reviewingId)} onClick={() => void load()}>
          {loading ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Обновить
        </button>
      </div>

      <div className="workspace-notice mt-4">
        {message} · Подтверждено: {confirmed} · Отклонено: {rejected}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pending.map((candidate) => {
          const busy = reviewingId === candidate.id;
          const source = candidate.gi_project_documents?.file_name ?? "Документ";
          return (
            <article key={candidate.id} className="clay-inset min-w-0 rounded-[22px] p-4">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[.08em] text-signal">Найденный факт</p>
                  <h3 className="mt-1 break-words font-semibold leading-6">{candidate.fact_label}</h3>
                </div>
                <span className="status-chip">уверенность {confidencePercent(candidate.confidence)}%</span>
              </div>

              <p className="mt-3 break-words text-base font-medium leading-7">{displayValue(candidate.value)}</p>

              <details className="requirement-details mt-3">
                <summary><span>Показать цитату</span><span>{source}</span><FileSearch size={15} /></summary>
                <blockquote className="mt-3 rounded-[16px] border-l-2 border-signal/60 bg-black/15 p-3 text-xs leading-5 text-mist/60">
                  {candidate.quote}
                </blockquote>
                <p className="mt-2 break-words text-[10px] leading-4 text-mist/35">{source} · {candidate.locator}</p>
              </details>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="secondary-cta" disabled={busy || Boolean(reviewingId)} onClick={() => void review(candidate, "rejected")}>
                  {busy ? <LoaderCircle className="animate-spin" size={15} /> : <X size={15} />} Отклонить
                </button>
                <button className="primary-cta" disabled={busy || Boolean(reviewingId)} onClick={() => void review(candidate, "confirmed")}>
                  {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} Подтвердить
                </button>
              </div>
            </article>
          );
        })}

        {!loading && pending.length === 0 ? (
          <div className="col-span-full rounded-[22px] border border-dashed border-white/10 p-5 text-sm leading-6 text-mist/45">
            Все найденные факты проверены. Новые появятся после загрузки и разбора документов.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function friendlyFactError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("permission denied") || normalized.includes("not authorized")) return "Сессия Telegram устарела. Повторно откройте мини-приложение.";
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("timeout")) return "Не удалось получить факты. Повторите обновление через несколько секунд.";
  return raw && raw.length <= 160 ? raw : "Не удалось загрузить или сохранить найденные факты.";
}
