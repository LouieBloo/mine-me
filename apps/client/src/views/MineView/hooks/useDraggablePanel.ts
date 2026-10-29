import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface PanelPosition {
  left: number;
  top: number;
}

/** How far the pointer must travel before a press on the handle counts as a drag (below it, it is a click). */
export const DRAG_THRESHOLD_PX = 4;
/** How much of the panel must stay inside its container so it can always be grabbed again. */
const KEEP_VISIBLE_PX = 48;

/** Keeps a panel reachable: at least `KEEP_VISIBLE_PX` of it stays inside the container. */
export function clampPanelPosition(pos: PanelPosition, panel: { width: number; height: number }, container: { width: number; height: number }): PanelPosition {
  return {
    left: Math.min(Math.max(pos.left, KEEP_VISIBLE_PX - panel.width), Math.max(KEEP_VISIBLE_PX - panel.width, container.width - KEEP_VISIBLE_PX)),
    top: Math.min(Math.max(pos.top, 0), Math.max(0, container.height - KEEP_VISIBLE_PX)),
  };
}

/** Reads a saved position; anything missing or odd means "not placed yet". */
export function readSavedPosition(storageKey: string): PanelPosition | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) return { left: parsed.left, top: parsed.top };
  } catch {
    // storage unavailable or corrupt: fall back to the default place
  }
  return null;
}

function savePosition(storageKey: string, pos: PanelPosition): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pos));
  } catch {
    // a position that is not remembered is only a convenience lost
  }
}

/**
 * Makes an absolutely positioned panel draggable by a handle (its title bar). Until it is moved it has no position of its
 * own (`position` is null, so its CSS default place applies); a moved position is remembered per viewer. `consumeClick`
 * tells the handle's click to ignore the click that ends a drag.
 */
export function useDraggablePanel(storageKey: string, panelRef: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<PanelPosition | null>(() => readSavedPosition(storageKey));
  const drag = useRef<{ startX: number; startY: number; origin: PanelPosition; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel || e.button !== 0) return;
    const container = panel.offsetParent?.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: { left: rect.left - (container?.left ?? 0), top: rect.top - (container?.top ?? 0) },
      moved: false,
    };
    justDragged.current = false;
  }, [panelRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      const panel = panelRef.current;
      if (!d || !panel) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      const container = panel.offsetParent?.getBoundingClientRect();
      const next = { left: d.origin.left + dx, top: d.origin.top + dy };
      setPosition(container
        ? clampPanelPosition(next, { width: panel.offsetWidth, height: panel.offsetHeight }, { width: container.width, height: container.height })
        : next);
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      if (d?.moved) {
        justDragged.current = true;
        setPosition((p) => {
          if (p) savePosition(storageKey, p);
          return p;
        });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [panelRef, storageKey]);

  /** True once for the click that follows a drag, so dropping the panel does not also fold it. */
  const consumeClick = useCallback((): boolean => {
    const was = justDragged.current;
    justDragged.current = false;
    return was;
  }, []);

  return { position, onPointerDown, consumeClick };
}
