import { useEffect, useRef } from 'react';
import { EXIT_KEY } from './ExitPrompt';

/**
 * Calls `onPress` when the exit key goes down while `enabled` (the player stands at the extraction point and nothing else
 * is open). Ignored while typing in a field and while a modifier is held, and a held key does not repeat.
 */
export function useExitKey(enabled: boolean, onPress: () => void): void {
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== EXIT_KEY) return;
      e.preventDefault();
      onPressRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
