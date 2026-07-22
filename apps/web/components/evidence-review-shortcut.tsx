"use client";

import { useEffect, useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { getEvidenceReviewerStatus } from "../lib/evidence-review";

export function EvidenceReviewShortcut() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void getEvidenceReviewerStatus()
        .then((status) => {
          if (active) setVisible(status.authorized);
        })
        .catch(() => {
          if (active) setVisible(false);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:right-5">
      <a
        href="/catalogue-control"
        className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-white/10 bg-ink/95 px-4 py-3 text-xs font-semibold text-mist shadow-2xl backdrop-blur"
      >
        <Database size={16} /> Контроль каталога
      </a>
      <a
        href="/evidence-review"
        className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-signal/30 bg-signal px-4 py-3 text-xs font-semibold text-ink shadow-2xl"
      >
        <ShieldCheck size={16} /> Проверка доказательств
      </a>
    </div>
  );
}
