import { useEffect, useRef } from 'react';
import {
  type MiningSessionClientState,
  type MiningStateTickPayload,
  type MiningBackpackItem,
  type PlayerState,
  type GameItem,
} from '@mine-me/shared';
import type { MiningClientWorld } from '../systems/MiningClientWorld';
import { EntityDefinitionCache } from '../systems/EntityDefinitionCache';
import {
  createTickEffectState,
  handleStateTick,
  type TickEffectState,
  type TickHandlerContext,
} from '../systems/tickHandlers';
import type { SoundManager } from '../../../../../services/sound';

export interface UseMiningStateSyncOptions {
  onEvent: (event: 'mining_state_tick', handler: (payload: MiningStateTickPayload) => void) => () => void;
  /** The join snapshot; its entities are already fully described, so the cache starts from it. */
  initialSessionState?: Partial<Pick<MiningSessionClientState, 'mobs' | 'otherPlayers' | 'activeDynamites' | 'droppedItems'>>;
  playerState: PlayerState;
  equippedWeapon: GameItem | null;
  soundManager: SoundManager;
  /** The refs, renderers and engines each server tick updates. */
  world: MiningClientWorld;
  containersReady: boolean;
  onVisionChange?: (newVision: number) => void;
  onBackpackChange?: (newBackpack: MiningBackpackItem[]) => void;
}

/**
 * Synchronizes real-time 30 Hz server ticks with local graphics and state refs
 * with ZERO React re-renders.
 */
export function useMiningStateSync({
  onEvent,
  initialSessionState,
  playerState,
  equippedWeapon,
  soundManager,
  world,
  containersReady,
  onVisionChange,
  onBackpackChange,
}: UseMiningStateSyncOptions) {
  const {
    torchEmittersRef,
    blockEmittersRef,
    dynamiteVisualManagerRef,
    droppedItemVisualManagerRef,
    particleEngineRef,
    lightingEngineRef,
  } = world;
  const onVisionChangeRef = useRef(onVisionChange);
  onVisionChangeRef.current = onVisionChange;

  const onBackpackChangeRef = useRef(onBackpackChange);
  onBackpackChangeRef.current = onBackpackChange;

  // Static entity descriptions arrive once; each tick only carries what changes (see EntityDefinitionCache)
  const entityDefsRef = useRef<EntityDefinitionCache | null>(null);
  if (!entityDefsRef.current) {
    entityDefsRef.current = new EntityDefinitionCache();
    entityDefsRef.current.seedFromSnapshot(initialSessionState);
  }

  const effectsRef = useRef<TickEffectState>(createTickEffectState());

  useEffect(() => {
    const ctx: TickHandlerContext = {
      world,
      soundManager,
      playerId: playerState?.id,
      hasEquippedWeapon: Boolean(equippedWeapon),
      containersReady,
      entityDefs: entityDefsRef.current!,
      effects: effectsRef.current,
      onVisionChange: (vision) => onVisionChangeRef.current?.(vision),
      onBackpackChange: (backpack) => onBackpackChangeRef.current?.(backpack),
    };
    const cleanup = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => handleStateTick(payload, ctx));

    return () => {
      cleanup();
      torchEmittersRef.current.forEach((emitter) => emitter.destroy());
      torchEmittersRef.current.clear();
      blockEmittersRef.current.forEach((emitter) => emitter.destroy());
      blockEmittersRef.current.clear();
      dynamiteVisualManagerRef.current?.destroy(
        particleEngineRef.current,
        lightingEngineRef.current,
        soundManager
      );
      droppedItemVisualManagerRef.current?.destroy(
        particleEngineRef.current,
        lightingEngineRef.current
      );
    };
  }, [onEvent, containersReady]);
}
