import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { SpriteRenderer } from '../../components/game/SpriteRenderer/SpriteRenderer';
import type { SpriteRendererHandle } from '../../components/game/SpriteRenderer/SpriteRenderer';
import { PixiStageProvider } from '../../components/game/PixiStageContext/PixiStageContext';
import { CombatAnimationSequencer, buildAttackSteps } from '../../components/game/combat/CombatAnimationSequencer';
import type { CombatAnimationStep } from '../../components/game/combat/CombatAnimationSequencer';
import type { GearLayerDescriptor } from '../../components/game/sprites';
import { notificationService } from '../../services/notificationService';
import { type GearSubType, getAssetUrl } from '@mine-me/shared';
import './TrainingView.css';

/**
 * TrainingView — lets the player train combat or defense against a target dummy.
 *
 * Layout mirrors CombatView: player character on the left, target dummy on the
 * right, with Attack/Defend buttons. Each action costs 20 stamina and increments
 * the corresponding stat by 1.
 */
export const TrainingView: React.FC = () => {
  const { activeCharacter, playerState } = useGame();
  const { sendGameEvent } = useSocket();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Refs for sprite renderers
  const playerSpriteRef = useRef<SpriteRendererHandle>(null);
  const dummySpriteRef = useRef<SpriteRendererHandle>(null);

  // Persistent sequencer instance
  const sequencerRef = useRef<CombatAnimationSequencer>(new CombatAnimationSequencer());

  const baseBodyUrl = getAssetUrl('/assets/gear/base-body.png');

  // Derive gear layers from inventory
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState?.inventory?.items) return [];
    return playerState.inventory.items
      .filter(inv => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map(inv => ({
        url: getAssetUrl(inv.item.gearImageUrl),
        subType: inv.item.subType as GearSubType,
      }));
  }, [playerState?.inventory?.items]);

  // Derived stats from playerState
  const stamina = playerState?.attributes.stamina ?? 0;
  const maxStamina = playerState?.attributes.maxStamina ?? 100;
  const combatScore = playerState?.attributes.combatScore ?? 0;
  const defenseScore = playerState?.attributes.defenseScore ?? 0;

  const isInteractionDisabled = submitting || animating || stamina < 20;

  const handleLeaveTraining = () => {
    sequencerRef.current.cancel();
    navigate('/home');
  };

  /**
   * Perform a training action with full attack animation.
   */
  const handleTrainingAction = useCallback(async (action: 'Attack' | 'Defend') => {
    if (submitting || animating || stamina < 20) return;

    setSubmitting(true);
    setAnimating(true);

    try {
      // Build the attack animation
      const playerContainer = playerSpriteRef.current?.getContainer();
      const playerOrigin = playerSpriteRef.current?.getOriginPosition();
      const dummyContainer = dummySpriteRef.current?.getContainer();

      if (playerContainer && dummyContainer && playerOrigin) {
        // Cancel any in-progress sequence
        sequencerRef.current.cancel();
        sequencerRef.current = new CombatAnimationSequencer();

        const steps: CombatAnimationStep[] = [];

        if (action === 'Attack') {
          // Player attacks the dummy
          steps.push(...buildAttackSteps({
            attacker: playerContainer,
            target: dummyContainer,
            attackerOriginX: playerOrigin.x,
            attackerOriginY: playerOrigin.y,
            direction: 'right',
            onMoveStart: () => {
              playerSpriteRef.current?.playAnimation('walking');
            },
            onImpact: () => {
              playerSpriteRef.current?.playAnimation('attacking');
              playerSpriteRef.current?.showFloatingText({
                text: '+1 ATK',
                color: '#ffaa00',
                fontSize: 28,
              });
            },
            onReturnIdle: () => {
              playerSpriteRef.current?.playAnimation('idle');
            },
          }));
        } else {
          // Defend: dummy "attacks" the player (player blocks)
          // We animate the player doing a defend stance
          steps.push(
            { type: 'effect', execute: () => playerSpriteRef.current?.playAnimation('defending') },
            { type: 'wait', duration: 400 },
            {
              type: 'effect',
              execute: () => {
                playerSpriteRef.current?.showFloatingText({
                  text: '+1 DEF',
                  color: '#6688ff',
                  fontSize: 28,
                });
              },
            },
            { type: 'wait', duration: 400 },
            { type: 'effect', execute: () => playerSpriteRef.current?.playAnimation('idle') },
          );
        }

        // Play the animation
        try {
          await sequencerRef.current.playSequence(steps);
        } catch (err) {
          console.warn('[TrainingView] Animation sequence error:', err);
        }
      }

      // Send the event to the server (stat changes come back via character_stat_update)
      const result = await sendGameEvent({ type: 'training_action', action });

      if (!result.success) {
        notificationService.error('Training Failed', result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('[TrainingView] Training action error:', err);
      notificationService.error('Error', err.message);
    } finally {
      setSubmitting(false);
      setAnimating(false);
    }
  }, [submitting, animating, stamina, sendGameEvent]);

  // Redirect if no character
  useEffect(() => {
    if (!activeCharacter) {
      navigate('/home');
    }
  }, [activeCharacter, navigate]);

  if (!activeCharacter || !playerState) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-400 font-bold tracking-widest uppercase animate-pulse">Loading Training...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />

      {/* Header Info */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md pointer-events-auto">
          <h2 className="text-xl font-black text-amber-500 uppercase">Training Grounds</h2>
          <div className="mt-2 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">ATK</span>
              <span className="text-lg font-black text-white">{combatScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">DEF</span>
              <span className="text-lg font-black text-white">{defenseScore}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md flex flex-col items-end gap-2 pointer-events-auto">
          {/* Stamina bar */}
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
            onClick={handleLeaveTraining}
            className="px-4 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-900/50 rounded-lg transition-all active:scale-95 cursor-pointer shadow-lg"
          >
            Leave Training
          </button>
        </div>
      </div>

      {/* Visual Canvas Area */}
      <PixiStageProvider className="flex-1 relative flex overflow-hidden">
        {/* Player Character */}
        <div className="w-1/2 flex items-center justify-center relative z-10">
          <div className="w-32 h-64 bg-slate-700 rounded-full blur-xl absolute bottom-1/4 opacity-50"></div>
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

        {/* Target Dummy */}
        <div className="w-1/2 relative flex flex-col items-center justify-center">
          <div className="relative flex items-center gap-6">
            {/* Dummy label */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 flex flex-col items-center z-20">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap drop-shadow-md bg-slate-900/50 px-2 py-0.5 rounded">
                Training Dummy
              </span>
            </div>

            {/* Dummy visual — uses SpriteRenderer for animation targeting compatibility */}
            <div className="relative flex items-center justify-center">
              <SpriteRenderer
                ref={dummySpriteRef}
                type="composite"
                baseBodyUrl={baseBodyUrl}
                gearLayers={[]}
                width={200}
                height={280}
                flipped={true}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pointer-events-auto z-20">
              <button
                disabled={isInteractionDisabled}
                onClick={() => handleTrainingAction('Attack')}
                className={`px-8 py-3 rounded font-black uppercase tracking-widest text-sm transition-all cursor-pointer ${
                  isInteractionDisabled
                    ? 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)] active:scale-95'
                }`}
              >
                ⚔️ Attack
              </button>
              <button
                disabled={isInteractionDisabled}
                onClick={() => handleTrainingAction('Defend')}
                className={`px-8 py-3 rounded font-black uppercase tracking-widest text-sm transition-all cursor-pointer ${
                  isInteractionDisabled
                    ? 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)] active:scale-95'
                }`}
              >
                🛡️ Defend
              </button>

              {stamina < 20 && (
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest text-center mt-1">
                  Not enough stamina
                </p>
              )}
            </div>
          </div>
        </div>
      </PixiStageProvider>

      {/* Bottom Controls */}
      <div className="h-28 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-center relative z-20 pointer-events-auto shrink-0">
        <div className="flex flex-col items-center gap-2">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            {animating
              ? 'Training in progress...'
              : stamina < 20
                ? 'Not enough stamina — go rest!'
                : 'Select an action to train'}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            <span>Attack costs 20 stamina → +1 Combat</span>
            <span className="text-slate-700">|</span>
            <span>Defend costs 20 stamina → +1 Defense</span>
          </div>
        </div>
      </div>
    </div>
  );
};
