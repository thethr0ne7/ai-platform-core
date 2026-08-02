"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  Landmark,
  Layers3,
  ListTree,
  Route,
  ShieldCheck,
} from "lucide-react";

const layers = [
  {
    id: "report-summary",
    title: "Итог",
    subtitle: "Главный вывод и готовность",
    icon: Gauge,
  },
  {
    id: "report-measures",
    title: "Меры",
    subtitle: "Поддержка, блокеры и сценарии",
    icon: Landmark,
  },
  {
    id: "report-documents",
    title: "Документы",
    subtitle: "Файлы и подтверждённые факты",
    icon: FileText,
  },
  {
    id: "report-evidence",
    title: "Доказательства",
    subtitle: "Источники, изменения и сигналы",
    icon: ShieldCheck,
  },
  {
    id: "report-actions",
    title: "Действия",
    subtitle: "Маршрут, возможности и источники",
    icon: Route,
  },
] as const;

type LayerId = (typeof layers)[number]["id"];

export function InfiniteZoomController() {
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>("report-summary");
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    const locateWorkspace = () => {
      const next = document.querySelector<HTMLElement>(".report-workspace");
      setWorkspace((current) => current === next ? current : next);
    };

    locateWorkspace();
    const observer = new MutationObserver(locateWorkspace);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!workspace) {
      setMountNode(null);
      return;
    }

    const node = document.createElement("div");
    node.dataset.infiniteZoomController = "true";
    workspace.prepend(node);
    setMountNode(node);

    const hash = window.location.hash.slice(1) as LayerId;
    if (layers.some((layer) => layer.id === hash)) setActiveLayer(hash);

    return () => {
      node.remove();
      setMountNode(null);
    };
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;

    const applyLayer = () => {
      const originalNavigation = workspace.querySelector<HTMLElement>(".report-nav");
      if (originalNavigation) originalNavigation.hidden = true;

      const contentChildren = Array.from(workspace.children).filter((child) => {
        const element = child as HTMLElement;
        return !element.dataset.infiniteZoomController && element !== originalNavigation;
      }) as HTMLElement[];

      const startIndexes = layers.map((layer) => {
        const anchor = workspace.querySelector<HTMLElement>(`#${layer.id}`);
        return anchor ? contentChildren.indexOf(anchor) : -1;
      });
      const activeIndex = layers.findIndex((layer) => layer.id === activeLayer);
      const start = startIndexes[activeIndex];
      const nextStart = startIndexes.slice(activeIndex + 1).find((index) => index >= 0) ?? contentChildren.length;

      contentChildren.forEach((element, index) => {
        element.hidden = start < 0 ? false : index < start || index >= nextStart;
      });
    };

    applyLayer();
    const observer = new MutationObserver(applyLayer);
    observer.observe(workspace, { childList: true, subtree: false });

    return () => {
      observer.disconnect();
      const originalNavigation = workspace.querySelector<HTMLElement>(".report-nav");
      if (originalNavigation) originalNavigation.hidden = false;
      Array.from(workspace.children).forEach((child) => {
        (child as HTMLElement).hidden = false;
      });
    };
  }, [activeLayer, workspace]);

  const currentIndex = useMemo(
    () => Math.max(0, layers.findIndex((layer) => layer.id === activeLayer)),
    [activeLayer],
  );
  const current = layers[currentIndex];

  const selectLayer = useCallback((id: LayerId) => {
    setActiveLayer(id);
    setMapOpen(false);
    window.history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".report-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!workspace) return;
      if (event.key === "Escape") setMapOpen(false);
      if (event.key === "ArrowLeft" && currentIndex > 0) selectLayer(layers[currentIndex - 1].id);
      if (event.key === "ArrowRight" && currentIndex < layers.length - 1) selectLayer(layers[currentIndex + 1].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, selectLayer, workspace]);

  if (!workspace || !mountNode) return null;

  const CurrentIcon = current.icon;

  return createPortal(
    <div className="sticky top-2 z-50 mb-3 min-w-0" aria-label="Масштаб отчёта">
      <div className="glass-surface rounded-[24px] p-2 shadow-2xl backdrop-blur-xl">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button
            type="button"
            className="icon-button h-11 w-11 rounded-[16px] disabled:opacity-30"
            disabled={currentIndex === 0}
            onClick={() => selectLayer(layers[currentIndex - 1].id)}
            aria-label="Предыдущий уровень"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            className="min-w-0 rounded-[18px] border border-signal/20 bg-signal/[.065] px-3 py-2.5 text-left"
            onClick={() => setMapOpen((value) => !value)}
            aria-expanded={mapOpen}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-signal text-ink">
                <CurrentIcon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-medium text-signal">Уровень {currentIndex + 1} из {layers.length}</span>
                <span className="block truncate text-sm font-semibold text-mist">{current.title}</span>
              </span>
              <Layers3 className="ml-auto shrink-0 text-mist/40" size={17} />
            </span>
          </button>

          <button
            type="button"
            className="icon-button h-11 w-11 rounded-[16px] disabled:opacity-30"
            disabled={currentIndex === layers.length - 1}
            onClick={() => selectLayer(layers[currentIndex + 1].id)}
            aria-label="Следующий уровень"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {mapOpen ? (
          <div className="mt-2 rounded-[20px] border border-mist/[.08] bg-ink/95 p-2">
            <div className="mb-2 flex items-center gap-2 px-2 py-1 text-[10px] font-medium text-mist/40">
              <ListTree size={14} /> Карта отчёта
            </div>
            <div className="grid gap-1.5 sm:grid-cols-5">
              {layers.map((layer, index) => {
                const Icon = layer.icon;
                const selected = layer.id === activeLayer;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => selectLayer(layer.id)}
                    className={`grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-2 rounded-[16px] border px-2.5 py-2.5 text-left transition ${selected ? "border-signal/30 bg-signal/[.09]" : "border-transparent bg-mist/[.025] hover:border-mist/[.08]"}`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-[13px] ${selected ? "bg-signal text-ink" : "bg-mist/[.05] text-mist/50"}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[9px] text-mist/35">0{index + 1}</span>
                      <span className="block truncate text-xs font-medium text-mist">{layer.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="px-2 pb-1 pt-2 text-[10px] leading-4 text-mist/35">Показывается только выбранный слой. Детали не конкурируют за экран и не перекрывают управление.</p>
          </div>
        ) : null}
      </div>
    </div>,
    mountNode,
  );
}
