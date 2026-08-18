import { useEffect, useRef } from 'react';
import type { MiningInputState, Vector2D } from '@mine-me/shared';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';

export interface UseMiningInputOptions {
  sendGameEvent: (event: any) => Promise<any> | void;
  playerSpriteRef: React.RefObject<ModularCharacterSprite | null>;
  flashlightRef: React.RefObject<SpotLight | null>;
  showDebugRef: React.MutableRefObject<boolean>;
  playerFacingDirRef: React.MutableRefObject<Vector2D>;
  isFacingLeftRef: React.MutableRefObject<boolean>;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
}

export function useMiningInput({
  sendGameEvent,
  playerSpriteRef,
  flashlightRef,
  showDebugRef,
  playerFacingDirRef,
  isFacingLeftRef,
  zoom,
  onZoomChange,
}: UseMiningInputOptions) {
  const keysPressedRef = useRef<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    miningKey: boolean;
    sequence: number;
  }>({
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
    miningKey: false,
    sequence: 0,
  });

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    const updateInputState = (e: KeyboardEvent, isKeyDown: boolean) => {
      // Ignore keystrokes when typing in inputs/textareas
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      let changed = false;
      const current = keysPressedRef.current;

      if (key === 'w' || key === 'arrowup') {
        if (current.up !== isKeyDown) {
          current.up = isKeyDown;
          changed = true;
        }
      } else if (key === 's' || key === 'arrowdown') {
        if (current.down !== isKeyDown) {
          current.down = isKeyDown;
          changed = true;
        }
      } else if (key === 'a' || key === 'arrowleft') {
        if (current.left !== isKeyDown) {
          current.left = isKeyDown;
          changed = true;
        }
      } else if (key === 'd' || key === 'arrowright') {
        if (current.right !== isKeyDown) {
          current.right = isKeyDown;
          changed = true;
        }
      } else if (key === ' ' || e.code === 'Space') {
        if (current.jump !== isKeyDown) {
          current.jump = isKeyDown;
          changed = true;
        }
      } else if (key === 'f' && isKeyDown) {
        // Toggle Flashlight ON/OFF
        if (flashlightRef.current) {
          flashlightRef.current.enabled = !flashlightRef.current.enabled;
        }
      } else if (key === 't' && isKeyDown) {
        // Toggle Debug Collision & Reach Shapes ON/OFF
        showDebugRef.current = !showDebugRef.current;
      } else if (key === 'l' && isKeyDown) {
        // Place ladder hotkey (for testing/building)
        sendGameEvent({ type: 'mining_place_ladder' })?.catch?.(() => {});
      }

      if (changed) {
        let fx = 0;
        let fy = 0;
        if (current.left) fx -= 1;
        if (current.right) fx += 1;
        if (current.up) fy -= 1;
        if (current.down) fy += 1;

        if (fx !== 0 || fy !== 0) {
          const len = Math.hypot(fx, fy);
          playerFacingDirRef.current = { x: fx / len, y: fy / len };
          if (fx < 0) {
            isFacingLeftRef.current = true;
            playerSpriteRef.current?.setFlipped(true);
          } else if (fx > 0) {
            isFacingLeftRef.current = false;
            playerSpriteRef.current?.setFlipped(false);
          }
        }

        current.sequence++;
        const payloadInput: MiningInputState = { ...current };
        sendGameEvent({ type: 'mining_input', input: payloadInput });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => updateInputState(e, true);
    const handleKeyUp = (e: KeyboardEvent) => updateInputState(e, false);
    const handleBlur = () => {
      const current = keysPressedRef.current;
      if (current.up || current.down || current.left || current.right || current.jump || current.miningKey) {
        current.up = false;
        current.down = false;
        current.left = false;
        current.right = false;
        current.jump = false;
        current.miningKey = false;
        current.sequence++;
        sendGameEvent({ type: 'mining_input', input: { ...current } });
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const current = zoomRef.current;
      const nextZoom = Math.min(2.0, Math.max(1.0, Math.round((current + delta) * 100) / 100));
      if (nextZoom !== current && onZoomChangeRef.current) {
        onZoomChangeRef.current(nextZoom);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [sendGameEvent, playerSpriteRef, flashlightRef, showDebugRef, playerFacingDirRef, isFacingLeftRef]);

  return { keysPressedRef };
}
