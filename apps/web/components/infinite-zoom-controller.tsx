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
type DisplaySnapshot = { value: string; priority: string };

const DEFAULT_LAYER: LayerId = "report-actions";
const ACTIONS_SECONDARY_HEADINGS = new Set([
  "Подключённые возможности",
  "Государственные приоритеты",
  "Особенности территории",
  "Официальные источники отчёта",
]);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function isLayerId(value: string): value is LayerId {
  return layers.some((layer) => layer.id === value);
}

function elementHeadings(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll("h2, h3"))
    .map((heading) => heading.textContent?.trim() ?? "")
    .filter(Boolean);
}

function isMonitoringNoise(element: HTMLElement): boolean {
  return elementHeadings(element).some((heading) =>
    heading === "Новые изменения" || heading === "Аналитические сигналы"
  );
}

function isActionsSecondaryDetail(element: HTMLElement): boolean {
  return elementHeadings(element).some((heading) =>
    ACTIONS_SECONDARY_HEADINGS.has(heading)
  );
}

export function InfiniteZoomController() {
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>(DEFAULT_LAYER);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const originalDisplaysRef = useRef(new Map<HTMLElement, DisplaySnapshot>());

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
    if (!workspace) return;

    const hash = window.location.hash.slice(1);
    const initialLayer = isLayerId(hash) ? hash : DEFAULT_LAYER;
    setActiveLayer(initialLayer);
    if (!isLayerId(hash)) {
      window.history.replaceState(null, "", `#${initialLayer}`);
    }

    const previousPaddingBottom = workspace.style.paddingBottom;
    workspace.style.paddingBottom = "calc(7.25rem + env(safe-area-inset-bottom))";

    const originalNavigation = workspace.querySelector<HTMLElement>(".report-nav");
    const previousNavigationDisplay = originalNavigation
      ? {
          value: originalNavigation.style.getPropertyValue("display"),
          priority: originalNavigation.style.getPropertyPriority("display"),
        }
      : null;
    originalNavigation?.style.setProperty("display", "none", "important");
    originalNavigation?.setAttribute("aria-hidden", "true");

    const onHashChange = () => {
      const nextHash = window.location.hash.slice(1);
      if (isLayerId(nextHash)) setActiveLayer(nextHash);
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      workspace.style.paddingBottom = previousPaddingBottom;
      if (originalNavigation && previousNavigationDisplay) {
        if (previousNavigationDisplay.value) {
          originalNavigation.style.setProperty(
            "display",
            previousNavigationDisplay.value,
            previousNavigationDisplay.priority,
          );
        } else {
          originalNavigation.style.removeProperty("display");
        }
        originalNavigation.removeAttribute("aria-hidden");
      }
    };
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const originalDisplays = originalDisplaysRef.current;

    const applyLayer = () => {
      const originalNavigation = workspace.querySelector<HTMLElement>(".report-nav");
      originalNavigation?.style.setProperty("display", "none", "important");
      originalNavigation?.setAttribute("aria-hidden", "true");

      const contentChildren = Array.from(workspace.children)
        .filter((child) => child !== originalNavigation) as HTMLElement[];

      const indexByLayer = new Map<LayerId, number>();
      for (const layer of layers) {
        const anchor = workspace.querySelector<HTMLElement>(`#${layer.id}`);
        const index = anchor ? contentChildren.indexOf(anchor) : -1;
        if (index >= 0) indexByLayer.set(layer.id, index);
      }

      const start = indexByLayer.get(activeLayer) ?? -1;
      const boundaries = Array.from(indexByLayer.values()).sort((left, right) => left - right);
      const nextStart = boundaries.find((index) => index > start) ?? contentChildren.length;

      contentChildren.forEach((element, index) => {
        if (!originalDisplays.has(element)) {
          originalDisplays.set(element, {
            value: element.style.getPropertyValue("display"),
            priority: element.style.getPropertyPriority("display"),
          });
        }

        const inActiveRange = start < 0 || (index >= start && index < nextStart);
        const hiddenAsMonitoringNoise = activeLayer === "report-evidence" && isMonitoringNoise(element);
        const hiddenAsActionsSecondary = activeLayer === "report-actions" && isActionsSecondaryDetail(element);
        const visible = inActiveRange && !hiddenAsMonitoringNoise && !hiddenAsActionsSecondary;
        const original = originalDisplays.get(element);

        if (visible) {
          if (original?.value) {
            element.style.setProperty("display", original.value, original.priority);
          } else {
            element.style.removeProperty("display");
          }
          element.removeAttribute("aria-hidden");
        } else {
          element.style.setProperty("display", "none", "important");
          element.setAttribute("aria-hidden", "true");
        }
      });
    };

    applyLayer();
    const observer = new MutationObserver(applyLayer);
    observer.observe(workspace, { childList: true, subtree: false });

    return () => {
      observer.disconnect();
      for (const [element, original] of originalDisplays.entries()) {
        if (original.value) {
          element.style.setProperty("display", original.value, original.priority);
        } else {
          element.style.removeProperty("display");
        }
        element.removeAttribute("aria-hidden");
      }
      originalDisplays.clear();
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
  const notchPath = `M 18 16 H ${notchCenter - 37} C ${notchCenter - 23} 16 ${notchCenter - 30} 52 ${notchCenter} 52 C ${notchCenter + 30} 52 ${notchCenter + 23} 16 ${notchCenter + 37} 16 H 482 Q 490 16 490 25 V 78 Q 490 87 481 87 H 19 Q 10 87 10 78 V 25 Q 10 16 18 16 Z`;

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

  if (!workspace || typeof document === "undefined") return null;

  const MarkerIcon = markerLayer.icon;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] mx-auto max-w-3xl px-3 pb-[max(.45rem,env(safe-area-inset-bottom))]"
      aria-label="Этапы проекта"
    >
      <div className="pointer-events-auto mx-auto max-w-xl">
        <span className="sr-only" aria-live="polite">
          Этап {currentIndex + 1} из {layers.length}: {current.title}. {current.subtitle}
        </span>

        <div ref={dockRef} className="relative h-[92px] select-none">
          <svg
            className="absolute inset-0 h-full w-full overflow-visible drop-shadow-2xl"
            viewBox="0 0 500 92"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={notchPath}
              fill="rgba(8, 11, 9, 0.97)"
              stroke="rgba(255, 255, 255, 0.14)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              className="transition-all duration-300 motion-reduce:transition-none"
            />
          </svg>

          <div className="absolute inset-x-0 top-[18px] grid h-[68px] grid-cols-5 px-1">
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
                    className={`transition motion-reduce:transition-none ${selected ? "opacity-0" : "text-mist/45 group-hover:text-mist/75"}`}
                  />
                  <span className={`w-full truncate px-0.5 text-[10px] font-medium transition motion-reduce:transition-none ${selected ? "text-signal" : "text-mist/42"}`}>
                    {layer.title}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="absolute top-0 grid h-[52px] w-[52px] -translate-x-1/2 touch-none place-items-center rounded-full border border-signal/60 bg-signal text-ink shadow-[0_0_0_5px_rgba(8,11,9,.96),0_10px_28px_rgba(170,255,40,.28)] transition-[left,transform] duration-300 motion-reduce:transition-none active:scale-95"
            style={{ left: markerLeft, touchAction: "none" }}
            onPointerDown={handleMarkerPointerDown}
            onPointerMove={handleMarkerPointerMove}
            onPointerUp={commitMarker}
            onPointerCancel={() => {
              pointerIdRef.current = null;
              setDragIndex(null);
            }}
            aria-label={`Текущий этап: ${markerLayer.title}. Можно перетащить для перехода.`}
          >
            <MarkerIcon size={20} />
          </button>
        </div>
      </div>
    </nav>,
    document.body,
  );
}
