import { useEffect, useMemo } from 'react';
import type { MiningPosition, Vector2D } from '@mine-me/shared';
import { notificationService } from '../../../../../services/notificationService';
import type { SandboxViewState } from '../../../sandbox/sandboxTool';
import type { IMouseAction } from '../input/MouseAction';
import { FreeCameraAction, IgniteAction, PlaceDoodadAction, PourFluidAction, ReleaseGasAction, RemoveDoodadAction, SpawnMobAction } from '../input/SandboxActions';
import type { FreeCamera } from '../systems/FreeCamera';
import type { MiningClientWorld } from '../systems/MiningClientWorld';

/** Sends a sandbox command and tells the user if the server refused it. */
export async function sendSandboxCommand(
  sendGameEvent: (event: any) => Promise<any>,
  event: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await sendGameEvent(event);
    if (res?.success) return true;
    notificationService.error('Sandbox', res?.error || 'The sandbox could not do that.');
  } catch (err: any) {
    notificationService.error('Sandbox', err?.message || 'Could not reach the server.');
  }
  return false;
}

/**
 * The mouse tool the sandbox panel selected (pour, release gas, spawn, ignite, place or remove a doodad), or the do-nothing action used
 * while the free camera is on. Returned as an override for the normal item-driven action; null
 * means "no override" (the equipped item decides, as in a normal mine).
 */
export function useSandboxMouseAction(
  sandbox: SandboxViewState | undefined,
  sendGameEvent: (event: any) => Promise<any>,
): IMouseAction | null {
  const tool = sandbox?.tool;
  const freeCameraOn = sandbox?.freeCamera ?? false;
  const fluidKey = tool?.kind === 'pour' ? tool.fluidKey : null;
  const gasKey = tool?.kind === 'releaseGas' ? tool.gasKey : null;
  const mobId = tool?.kind === 'spawn' ? tool.mobId : null;
  const doodadId = tool?.kind === 'placeDoodad' ? tool.doodadId : null;

  return useMemo<IMouseAction | null>(() => {
    if (!sandbox) return null;
    if (freeCameraOn) return new FreeCameraAction();
    switch (tool?.kind) {
      case 'pour':
        return new PourFluidAction(fluidKey!, (t: MiningPosition) =>
          sendSandboxCommand(sendGameEvent, { type: 'sandbox_pour_fluid', x: t.x, y: t.y, fluidKey }),
        );
      case 'releaseGas':
        return new ReleaseGasAction(gasKey!, (t: MiningPosition) =>
          sendSandboxCommand(sendGameEvent, { type: 'sandbox_release_gas', x: t.x, y: t.y, gasKey }),
        );
      case 'spawn':
        return new SpawnMobAction(mobId!, (p: Vector2D) =>
          sendSandboxCommand(sendGameEvent, { type: 'sandbox_spawn_mob', mobId, x: p.x, y: p.y }),
        );
      case 'ignite':
        return new IgniteAction((t: MiningPosition) =>
          sendSandboxCommand(sendGameEvent, { type: 'sandbox_ignite', x: t.x, y: t.y }),
        );
      case 'placeDoodad':
        return new PlaceDoodadAction(doodadId!, (t: MiningPosition) =>
          sendSandboxCommand(sendGameEvent, { type: 'sandbox_place_doodad', doodadId, x: t.x, y: t.y }),
        );
      case 'removeDoodad':
        return new RemoveDoodadAction((t: MiningPosition) => sendSandboxCommand(sendGameEvent, { type: 'sandbox_remove_doodad', x: t.x, y: t.y }));
      default:
        return null;
    }
  }, [!!sandbox, freeCameraOn, tool?.kind, fluidKey, gasKey, mobId, doodadId, sendGameEvent]);
}

export interface UseSandboxFreeCameraOptions {
  /** Whether the free camera is on (always false outside the sandbox). */
  enabled: boolean;
  freeCamera: FreeCamera;
  world: Pick<MiningClientWorld, 'cameraRef' | 'keysPressedRef' | 'playerContainerRef'>;
  canvas: HTMLCanvasElement | null;
  sendGameEvent: (event: any) => Promise<any>;
}

/**
 * Detaches the camera from the player while `enabled` (the character is stopped first) and lets the
 * mouse drag the view. Keyboard panning is handled by the input hook, which defers to the camera.
 */
export function useSandboxFreeCamera({ enabled, freeCamera, world, canvas, sendGameEvent }: UseSandboxFreeCameraOptions): void {
  // The refs are stable; the `world` object is rebuilt every render, so the effects depend on the refs
  const { cameraRef, keysPressedRef, playerContainerRef } = world;
  useEffect(() => {
    if (!enabled) return;
    const center = cameraRef.current?.getCenter();
    const player = playerContainerRef.current;
    freeCamera.enable(center ?? (player ? { x: player.x, y: player.y } : { x: 0, y: 0 }));
    // The character must not keep walking or mining while the view is somewhere else
    const keys = keysPressedRef.current;
    if (keys.up || keys.down || keys.left || keys.right || keys.jump || keys.miningKey) {
      keys.up = keys.down = keys.left = keys.right = keys.jump = keys.miningKey = false;
      keys.miningTarget = null;
      keys.sequence++;
      sendGameEvent({ type: 'mining_input', input: { ...keys } })?.catch?.(() => {});
    }
    return () => freeCamera.disable();
  }, [enabled, freeCamera, cameraRef, keysPressedRef, playerContainerRef, sendGameEvent]);

  useEffect(() => {
    if (!enabled || !canvas) return;
    let dragging = false;
    let last: Vector2D = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      freeCamera.dragBy(e.clientX - last.x, e.clientY - last.y, cameraRef.current?.getZoom() ?? 1);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      dragging = false;
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled, canvas, freeCamera, cameraRef]);
}
