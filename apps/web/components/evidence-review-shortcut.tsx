"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Database,
  Layers3,
  ShieldCheck,
  X,
} from "lucide-react";
import { getEvidenceReviewerStatus } from "../lib/evidence-review";

const destinations = [
  {
    href: "/control-center",
    title: "Аналитическое ядро",
    description: "Сигналы, траектории и состояние аналитики",
    icon: BrainCircuit,
  },
  {
    href: "/catalogue-control",
    title: "Контроль каталога",
    description: "Меры, кандидаты и проверка покрытия",
    icon: Database,
  },
  {
    href: "/evidence-review",
    title: "Проверка доказательств",
    description: "Цитаты, требования и экспертные решения",
    icon: ShieldCheck,
  },
] as const;

export function EvidenceReviewShortcut() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!visible) return;

    const mobile = window.matchMedia("(max-width: 639px)");
    const originalPadding = new Map<HTMLElement, string>();

    const restore = () => {
      originalPadding.forEach((value, element) => {
        element.style.paddingBottom = value;
      });
      originalPadding.clear();
    };

    const applyClearance = () => {
      if (!mobile.matches) {
        restore();
        return;
      }

      document.querySelectorAll<HTMLElement>("main.app-shell > div").forEach((element) => {
        if (!originalPadding.has(element)) originalPadding.set(element, element.style.paddingBottom);
        element.style.paddingBottom = "calc(6rem + env(safe-area-inset-bottom))";
      });
    };

    applyClearance();
    const observer = new MutationObserver(applyClearance);
    observer.observe(document.body, { childList: true, subtree: true });
    mobile.addEventListener("change", applyClearance);

    return () => {
      observer.disconnect();
      mobile.removeEventListener("change", applyClearance);
      restore();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(.75rem,env(safe-area-inset-bottom))] right-3 z-[70] grid h-[52px] w-[52px] place-items-center rounded-[20px] border border-signal/35 bg-signal text-ink shadow-2xl transition active:scale-95 sm:right-5 sm:flex sm:h-12 sm:w-auto sm:gap-2 sm:px-4"
        aria-label="Открыть экспертный контур"
        aria-expanded={open}
      >
        <Layers3 size={20} />
        <span className="hidden text-xs font-semibold sm:inline">Экспертный контур</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Экспертный контур">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
          />

          <section className="glass-surface relative z-10 w-full max-w-xl rounded-t-[30px] border-x-0 border-b-0 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:mb-4 sm:rounded-[30px] sm:border">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-mist/15 sm:hidden" />
            <div className="flex items-start justify-between gap-4 px-2 pb-3 pt-1">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-signal">ZOOM LEVEL · EXPERT</p>
                <h2 className="mt-1 text-xl font-semibold">Экспертный контур</h2>
                <p className="mt-1 text-xs leading-5 text-mist/45">Инструменты открываются только по запросу и больше не перекрывают основной интерфейс.</p>
              </div>
              <button
                type="button"
                className="icon-button h-10 w-10 rounded-[15px]"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-2">
              {destinations.map((destination, index) => {
                const Icon = destination.icon;
                return (
                  <a
                    key={destination.href}
                    href={destination.href}
                    className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-mist/[.08] bg-ink/55 p-3 transition hover:border-signal/30 hover:bg-signal/[.045]"
                  >
                    <span className={`grid h-11 w-11 place-items-center rounded-[16px] ${index === 2 ? "bg-signal text-ink" : "bg-mist/[.05] text-signal"}`}>
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-mist">{destination.title}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-mist/40">{destination.description}</span>
                    </span>
                    <span className="text-[10px] text-mist/30">0{index + 1}</span>
                  </a>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
