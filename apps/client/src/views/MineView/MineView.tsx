import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticker } from 'pixi.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { SpriteRenderer } from '../../components/game/SpriteRenderer/SpriteRenderer';
import type { SpriteRendererHandle } from '../../components/game/SpriteRenderer/SpriteRenderer';
import { PixiStageProvider } from '../../components/game/PixiStageContext/PixiStageContext';
import { CombatAnimationSequencer } from '../../components/game/combat/CombatAnimationSequencer';
import type { CombatAnimationStep } from '../../components/game/combat/CombatAnimationSequencer';
import { SpriteMotion } from '../../components/game/sprites/SpriteMotion';
import type { GearLayerDescriptor } from '../../components/game/sprites';
import { notificationService } from '../../services/notificationService';
import type { GearSubType } from '@nvg/shared';
import './MineView.css';

/**
 * Shake a container horizontally back and forth using the Pixi Ticker.
 */
const shakeContainer = (container: any, duration = 350, intensity = 8) => {
  if (!container || container.destroyed) return;
  const startX = container.x;
  const startTime = Date.now();

  const animate = () => {
    if (container.destroyed) {
      Ticker.shared.remove(animate);
      return;
    }
    const elapsed = Date.now() - startTime;
    if (elapsed >= duration) {
      container.x = startX;
      Ticker.shared.remove(animate);
      return;
    }

    const progress = elapsed / duration;
    const currentIntensity = intensity * (1 - progress);
    const offset = Math.sin(progress * Math.PI * 12) * currentIntensity;
    container.x = startX + offset;
  };

  Ticker.shared.add(animate);
};

export const MineView: React.FC = () => {
  const { activeCharacter, playerState } = useGame();
  const { sendGameEvent } = useSocket();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Refs for Sprite Renderers
  const playerSpriteRef = useRef<SpriteRendererHandle>(null);
  const rockSpriteRef = useRef<SpriteRendererHandle>(null);

  // Persistent sequencer instance
  const sequencerRef = useRef<CombatAnimationSequencer>(new CombatAnimationSequencer());

  const baseBodyUrl = `${import.meta.env.VITE_API_URL}/assets/gear/base-body.png`;

  // Derive gear layers from inventory
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState?.inventory?.items) return [];
    return playerState.inventory.items
      .filter(inv => inv.item.type === 'GEAR' && inv.item.gearImageUrl)
      .map(inv => ({
        url: `${import.meta.env.VITE_API_URL}${inv.item.gearImageUrl}`,
        subType: inv.item.subType as GearSubType,
      }));
  }, [playerState?.inventory?.items]);

  // Derived stats from playerState
  const stamina = playerState?.attributes.stamina ?? 0;
  const maxStamina = playerState?.attributes.maxStamina ?? 100;

  const isInteractionDisabled = submitting || animating || stamina < 25;

  const handleLeaveMine = () => {
    sequencerRef.current.cancel();
    navigate('/home');
  };

  /**
   * Perform mining action with full walking, striking, shaking, and reward presentation.
   */
  const handleMine = useCallback(async () => {
    if (submitting || animating || stamina < 25) return;

    setSubmitting(true);
    setAnimating(true);

    // Call server immediately to resolve drops while moving
    const resultPromise = sendGameEvent({ type: 'mine' });

    try {
      const playerContainer = playerSpriteRef.current?.getContainer();
      const playerOrigin = playerSpriteRef.current?.getOriginPosition();
      const rockContainer = rockSpriteRef.current?.getContainer();

      if (playerContainer && rockContainer && playerOrigin) {
        // Reset sequencer
        sequencerRef.current.cancel();
        sequencerRef.current = new CombatAnimationSequencer();

        const steps: CombatAnimationStep[] = [];

        // 1. Move start animation
        steps.push({
          type: 'effect',
          execute: () => {
            playerSpriteRef.current?.playAnimation('walking');
          },
        });

        // 2. Slide toward the rock
        const offset = SpriteMotion.calculateLungeOffset(playerContainer, rockContainer, 40, 'right');
        steps.push({
          type: 'moveTo',
          container: playerContainer,
          targetX: offset.x,
          targetY: offset.y,
          duration: 350,
          easing: 'easeIn',
        });

        // 3. Impact callback: strike, shake, fetch result, show floating text
        steps.push({
          type: 'callback',
          execute: async () => {
            playerSpriteRef.current?.playAnimation('attacking');
            shakeContainer(rockContainer);

            try {
              const result = await resultPromise;
              if (result.success) {
                if (result.data?.rewards && result.data.rewards.length > 0) {
                  for (const reward of result.data.rewards) {
                    rockSpriteRef.current?.showFloatingText({
                      text: `+${reward.quantity} ${reward.name}`,
                      color: '#f59e0b', // amber-500
                      fontSize: 28,
                    });
                  }
                } else {
                  rockSpriteRef.current?.showFloatingText({
                    text: 'Empty',
                    color: '#94a3b8', // slate-400
                    fontSize: 28,
                  });
                }
              } else {
                notificationService.error('Mining Failed', result.error || 'Unknown error');
                rockSpriteRef.current?.showFloatingText({
                  text: 'Failed',
                  color: '#ef4444', // red-500
                  fontSize: 28,
                });
              }
            } catch (err: any) {
              console.error('[MineView] Error receiving loot:', err);
              rockSpriteRef.current?.showFloatingText({
                text: 'Error',
                color: '#ef4444',
                fontSize: 28,
              });
            }
          },
        });

        // 4. Hold briefly at the rock
        steps.push({ type: 'wait', duration: 400 });

        // 5. Walk back
        steps.push({
          type: 'effect',
          execute: () => {
            playerSpriteRef.current?.playAnimation('idle');
          },
        });
        steps.push({
          type: 'moveBack',
          container: playerContainer,
          originX: playerOrigin.x,
          originY: playerOrigin.y,
          duration: 350,
        });

        // 6. Final cool down wait
        steps.push({ type: 'wait', duration: 150 });

        // Play entire sequence
        await sequencerRef.current.playSequence(steps);
      } else {
        // Fallback if Pixi elements aren't initialized yet
        const result = await resultPromise;
        if (!result.success) {
          notificationService.error('Mining Failed', result.error || 'Unknown error');
        }
      }
    } catch (err: any) {
      console.error('[MineView] Mining action error:', err);
      notificationService.error('Error', err.message);
    } finally {
      setSubmitting(false);
      setAnimating(false);
    }
  }, [submitting, animating, stamina, sendGameEvent]);

  // Redirect if no character is selected
  useEffect(() => {
    if (!activeCharacter) {
      navigate('/home');
    }
  }, [activeCharacter, navigate]);

  if (!activeCharacter || !playerState) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-400 font-bold tracking-widest uppercase animate-pulse">Loading Mine...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />

      {/* Top Header Controls */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md pointer-events-auto">
          <h2 className="text-xl font-black text-amber-500 uppercase tracking-widest">Dungeon Mine</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Location: {activeCharacter.cityId}</p>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md flex flex-col items-end gap-2 pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Stamina</span>
            <div className="w-32 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-600">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(0, (stamina / maxStamina) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 font-bold">{stamina}/{maxStamina}</span>
          </div>
          <button
            onClick={handleLeaveMine}
            className="px-4 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-900/50 rounded-lg transition-all active:scale-95 cursor-pointer shadow-lg"
          >
            Leave Mine
          </button>
        </div>
      </div>

      {/* Visual stage area */}
      <PixiStageProvider className="flex-1 relative flex overflow-hidden">
        {/* Left Character Area */}
        <div className="w-1/2 flex items-center justify-center relative z-10">
          <div className="w-32 h-64 bg-slate-700 rounded-full blur-xl absolute bottom-1/4 opacity-40"></div>
          <div className="z-10">
            <SpriteRenderer
              ref={playerSpriteRef}
              type="composite"
              baseBodyUrl={baseBodyUrl}
              gearLayers={gearLayers}
              width={256}
              height={320}
              flipped={false}
            />
          </div>
        </div>

        {/* Right Target / Rock Area */}
        <div className="w-1/2 relative flex flex-col items-center justify-center">
          <div className="relative flex items-center gap-6">
            <div className="absolute -top-14 left-1/2 -translate-x-1/2 w-32 flex flex-col items-center z-20">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap drop-shadow-md bg-slate-900/50 px-2 py-0.5 rounded">
                Vein of Rock
              </span>
            </div>

            <div className="relative flex items-center justify-center">
              <SpriteRenderer
                ref={rockSpriteRef}
                type="rock"
                width={160}
                height={160}
              />
            </div>

            {/* Mine Controls */}
            <div className="flex flex-col gap-3 pointer-events-auto z-20">
              <button
                disabled={isInteractionDisabled}
                onClick={handleMine}
                className={`px-8 py-3 rounded font-black uppercase tracking-widest text-sm transition-all cursor-pointer flex items-center gap-2 ${
                  isInteractionDisabled
                    ? 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] active:scale-95'
                }`}
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>⛏️</span>
                )}
                <span>Mine</span>
              </button>

              {stamina < 25 && (
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest text-center mt-1">
                  Requires 25 Stamina
                </p>
              )}
            </div>
          </div>
        </div>
      </PixiStageProvider>

      {/* Footer controls & guide */}
      <div className="h-28 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-center relative z-20 pointer-events-auto shrink-0">
        <div className="flex flex-col items-center gap-2">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            {animating
              ? 'Mining vein...'
              : stamina < 25
                ? 'Not enough stamina — leave and rest!'
                : 'Strike the rock to extract minerals'}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            <span>Each strike costs 25 stamina</span>
            <span className="text-slate-700">|</span>
            <span>Yields random city materials based on rarity</span>
          </div>
        </div>
      </div>
    </div>
  );
};
