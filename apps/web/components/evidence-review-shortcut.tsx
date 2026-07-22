"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
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
    <a
      href="/evidence-review"
      className="fixed bottom-4 right-3 z-[60] inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-signal/30 bg-signal px-4 py-3 text-xs font-semibold text-ink shadow-2xl sm:right-5"
    >
      <ShieldCheck size={16} /> Проверка доказательств
    </a>
  );
}
