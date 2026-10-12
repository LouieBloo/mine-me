import { useCallback, useEffect, useRef, useState } from 'react';

export const AUTO_HIDE_DEFAULT_MS = 5000;

export interface AutoHide {
  /** True while the element should be shown. */
  visible: boolean;
  /** Show the element and (re)start the hide countdown. */
  poke: () => void;
  /** Keep the element open (e.g. while hovered or dragged) until every hold is released. */
  hold: (reason: string) => void;
  /** Release a hold; once none are left the countdown starts again. */
  release: (reason: string) => void;
}

/**
 * Show-on-demand visibility: hidden until `poke()`, then visible for `durationMs`.
 * Each poke restarts the timer. While any hold is active the timer is paused, and it
 * restarts when the last hold is released.
 */
export function useAutoHide(durationMs: number = AUTO_HIDE_DEFAULT_MS): AutoHide {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdsRef = useRef<Set<string>>(new Set());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (holdsRef.current.size > 0) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, durationMs);
  }, [clearTimer, durationMs]);

  const poke = useCallback(() => {
    setVisible(true);
    startTimer();
  }, [startTimer]);

  const hold = useCallback((reason: string) => {
    holdsRef.current.add(reason);
    clearTimer();
  }, [clearTimer]);

  const release = useCallback((reason: string) => {
    if (!holdsRef.current.delete(reason)) return;
    if (holdsRef.current.size === 0) startTimer();
  }, [startTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { visible, poke, hold, release };
}
