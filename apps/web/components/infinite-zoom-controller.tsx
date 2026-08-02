"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  BriefcaseBusiness,
  FileText,
  Landmark,
  Route,
} from "lucide-react";

const layers = [
  {
    id: "report-summary",
    title: "Проект",
    subtitle: "Состояние проекта и главный вывод",
    icon: BriefcaseBusiness,
  },
  {
    id: "report-documents",
    title: "Документы",
    subtitle: "Файлы и обработка материалов",
    icon: FileText,
  },
  {
    id: "report-evidence",
    title: "Факты",
    subtitle: "Подтверждения, источники и проверки",
    icon: BadgeCheck,
  },
  {
    id: "report-measures",
    title: "Меры",
    subtitle: "Поддержка, требования и блокеры",
    icon: Landmark,
  },
  {
    id: "report-actions",
    title: "Действия",
    subtitle: "Следующие шаги и маршрут проекта",
    icon: Route,
  },
] as const;

type LayerId = (typeof layers)[number]["id"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function InfiniteZoomController() {
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>("report-summary");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const locateWorkspace = () => {
      const next = document.querySelector<HTMLElement>(".report-workspace");
      setWorkspace((current) => (current === next ? current : next));
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

    const previousPaddingBottom = workspace.style.paddingBottom;
    workspace.style.paddingBottom = "calc(8.25rem + env(safe-area-inset-bottom))";

    return () => {
      workspace.style.paddingBottom = previousPaddingBottom;
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

      const anchorIndexes = layers
        .map((layer) => {
          const anchor = workspace.querySelector<HTMLElement>(`#${layer.id}`);
          return anchor ? contentChildren.indexOf(anchor) : -1;
        })
        .filter((index) => index >= 0);

      const activeAnchor = workspace.querySelector<HTMLElement>(`#${activeLayer}`);
      const start = activeAnchor ? contentChildren.indexOf(activeAnchor) : -1;
      const nextStart = anchorIndexes
        .filter((index) => index > start)
        .sort((a, b) => a - b)[0] ?? contentChildren.length;

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
  const displayIndex = dragIndex ?? currentIndex;
  const current = layers[currentIndex];
  const markerLayer = layers[displayIndex];
  const markerLeft = `${((displayIndex + 0.5) / layers.length) * 100}%`;
  const notchCenter = 50 + displayIndex * 100;
  const notchPath = `M 24 18 H ${notchCenter - 38} C ${notchCenter - 24} 18 ${notchCenter - 30} 56 ${notchCenter} 56 C ${notchCenter + 30} 56 ${notchCenter + 24} 18 ${notchCenter + 38} 18 H 476 Q 488 18 488 30 V 78 Q 488 90 476 90 H 24 Q 12 90 12 78 V 30 Q 12 18 24 18 Z`;

  const selectLayer = useCallback((id: LayerId) => {
    setActiveLayer(id);
    setDragIndex(null);
    window.history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".report-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const indexFromPointer = useCallback((clientX: number) => {
    const dock = dockRef.current;
    if (!dock) return currentIndex;
    const rect = dock.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 0.9999);
    return clamp(Math.floor(ratio * layers.length), 0, layers.length - 1);
  }, [currentIndex]);

  const handleMarkerPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(indexFromPointer(event.clientX));
  }, [indexFromPointer]);

  const handleMarkerPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    setDragIndex(indexFromPointer(event.clientX));
  }, [indexFromPointer]);

  const commitMarker = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const nextIndex = indexFromPointer(event.clientX);
    pointerIdRef.current = null;
    setDragIndex(null);
    selectLayer(layers[nextIndex].id);
  }, [indexFromPointer, selectLayer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!workspace) return;
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        selectLayer(layers[currentIndex - 1].id);
      }
      if (event.key === "ArrowRight" && currentIndex < layers.length - 1) {
        selectLayer(layers[currentIndex + 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, selectLayer, workspace]);

  if (!workspace || !mountNode) return null;

  const MarkerIcon = markerLayer.icon;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] mx-auto max-w-3xl px-3 pb-[max(.55rem,env(safe-area-inset-bottom))]"
      aria-label="Этапы проекта"
    >
      <div className="pointer-events-auto mx-auto max-w-xl">
        <div
          aria-live="polite"
          className="mx-auto mb-1.5 w-fit max-w-[calc(100vw-2rem)] truncate rounded-full border border-mist/[.08] bg-ink/90 px-3 py-1.5 text-[10px] text-mist/55 shadow-lg backdrop-blur-xl"
        >
          Этап {currentIndex + 1} из {layers.length} · <span className="font-semibold text-mist">{current.title}</span> · {current.subtitle}
        </div>

        <div ref={dockRef} className="relative h-[104px] select-none">
          <svg
            className="absolute inset-0 h-full w-full overflow-visible text-ink drop-shadow-2xl"
            viewBox="0 0 500 104"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={notchPath}
              fill="rgba(8, 11, 9, 0.96)"
              stroke="rgba(255, 255, 255, 0.14)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "d 280ms cubic-bezier(.2,.8,.2,1)" }}
            />
          </svg>

          <div className="absolute inset-x-0 top-[20px] grid h-[74px] grid-cols-5 px-1">
            {layers.map((layer, index) => {
              const Icon = layer.icon;
              const selected = index === currentIndex;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => selectLayer(layer.id)}
                  className="group flex min-w-0 flex-col items-center justify-end gap-1 pb-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  aria-current={selected ? "step" : undefined}
                  aria-label={`${index + 1}. ${layer.title}`}
                >
                  <Icon
                    size={18}
                    className={`transition ${selected ? "opacity-0" : "text-mist/45 group-hover:text-mist/75"}`}
                  />
                  <span className={`w-full truncate px-0.5 text-[9px] font-medium transition ${selected ? "text-signal" : "text-mist/38"}`}>
                    {layer.title}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="absolute top-0 grid h-14 w-14 -translate-x-1/2 touch-none place-items-center rounded-full border border-signal/60 bg-signal text-ink shadow-[0_0_0_5px_rgba(8,11,9,.94),0_12px_34px_rgba(170,255,40,.32)] transition-[left,transform] duration-300 active:scale-95"
            style={{ left: markerLeft, touchAction: "none" }}
            onPointerDown={handleMarkerPointerDown}
            onPointerMove={handleMarkerPointerMove}
            onPointerUp={commitMarker}
            onPointerCancel={() => {
              pointerIdRef.current = null;
              setDragIndex(null);
            }}
            aria-label={`Текущий этап: ${markerLayer.title}. Перетащите для перехода.`}
          >
            <MarkerIcon size={21} />
          </button>
        </div>
      </div>
    </nav>,
    mountNode,
  );
}
