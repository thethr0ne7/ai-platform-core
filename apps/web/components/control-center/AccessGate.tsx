"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Ban, LoaderCircle, RefreshCw } from "lucide-react";
import { getEvidenceReviewerStatus } from "@/lib/evidence-review";

type Status = "checking" | "authorized" | "denied";

export default function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    check();
    return () => {
      active = false;
    };

    function check() {
      setStatus("checking");
      getEvidenceReviewerStatus()
        .then((result) => {
          if (!active) return;
          setStatus(result.authorized ? "authorized" : "denied");
        })
        .catch((error) => {
          if (!active) return;
          setMessage(error instanceof Error ? error.message : "Не удалось проверить доступ.");
          setStatus("denied");
        });
    }
  }, []);

  if (status === "checking") return <CheckingScreen />;
  if (status === "denied") return <AccessDenied message={message} />;
  return <>{children}</>;
}

function CheckingScreen() {
  return (
    <main className="app-shell">
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <section className="glass-surface rounded-[28px] p-6 sm:p-10">
          <LoaderCircle className="animate-spin text-signal" size={28} />
          <h1 className="mt-5 text-3xl font-semibold">Проверяем доступ к аналитическому ядру</h1>
          <p className="mt-3 text-sm leading-6 text-mist/50">Авторизация проходит через подпись Telegram Mini App.</p>
        </section>
      </div>
    </main>
  );
}

function AccessDenied({ message }: { message: string | null }) {
  return (
    <main className="app-shell">
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <section className="glass-surface rounded-[28px] p-6 sm:p-10">
          <Ban className="text-signal" size={28} />
          <h1 className="mt-5 text-3xl font-semibold">Доступ ограничен</h1>
          <p className="mt-4 text-sm leading-6 text-mist/55">
            {message ?? "Аналитическое ядро доступно только экспертам платформы."}
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link className="secondary-cta" href="/">
              <ArrowLeft size={15} /> К проектам
            </Link>
            <button className="primary-cta" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> Проверить снова
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
