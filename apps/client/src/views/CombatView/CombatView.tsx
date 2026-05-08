import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useChat } from '../../contexts/ChatContext';
import { SpriteRenderer } from '../../components/game/SpriteRenderer/SpriteRenderer';
import type { SpriteRendererHandle } from '../../components/game/SpriteRenderer/SpriteRenderer';
import { PixiStageProvider } from '../../components/game/PixiStageContext/PixiStageContext';
import { CombatAnimationSequencer, buildAttackSteps } from '../../components/game/combat/CombatAnimationSequencer';
import type { CombatAnimationStep } from '../../components/game/combat/CombatAnimationSequencer';
import type { GearLayerDescriptor } from '../../components/game/sprites';
import { notificationService } from '../../services/notificationService';
import './CombatView.css';
import type { CombatActionType, MobBattleState, GearSubType, DamageEvent, CombatLogMessage } from '@nvg/shared';

/** Color palette for floating damage indicators */
const FLOATING_TEXT_COLORS = {
  damage: '#ff4444',
  heal: '#44ff88',
  blocked: '#6688ff',
  critical: '#ffaa00',
} as const;

/**
 * Groups turnLogs into per-damage-event buckets by consuming them in order.
 *
 * The CombatEngine produces logs and damage events in the same order:
 * - System header ("--- Round N ---")
 * - Player attack logs (defense? + damage) paired with player damage events
 * - Mob attack logs (defense? + damage) paired with mob damage events
 * - Defend-only info logs have no corresponding damage event
 *
 * We consume logs from a queue, grouping them with each damage event by
 * popping until we hit a 'damage' type log (which marks the end of that event's logs).
 */
function groupLogsWithEvents(
  turnLogs: CombatLogMessage[],
  damageEvents: DamageEvent[]
): {
  systemLogs: CombatLogMessage[];
  eventGroups: { event: DamageEvent; logs: CombatLogMessage[] }[];
  trailingLogs: CombatLogMessage[];
} {
  const queue = [...turnLogs];
  const systemLogs: CombatLogMessage[] = [];
  const eventGroups: { event: DamageEvent; logs: CombatLogMessage[] }[] = [];

  // Pop system header(s)
  while (queue.length > 0 && queue[0].type === 'system') {
    systemLogs.push(queue.shift()!);
  }

  // For each damage event, consume logs until we hit a 'damage' type log
  for (const event of damageEvents) {
    const group: CombatLogMessage[] = [];
    while (queue.length > 0) {
      const log = queue.shift()!;
      group.push(log);
      if (log.type === 'damage') break;
    }
    eventGroups.push({ event, logs: group });
  }

  // Any remaining logs (defend-only actions, etc.)
  return { systemLogs, eventGroups, trailingLogs: [...queue] };
}

export const CombatView: React.FC = () => {
  const { battleState, activeCharacter, playerState } = useGame();
  const { sendGameEvent } = useSocket();
  const { setActiveTab, addCombatLogs } = useChat();
  const navigate = useNavigate();

  // pendingActions maps mob.id -> 'Attack' | 'Defend'
  const [pendingActions, setPendingActions] = useState<Record<string, CombatActionType>>({});
  const [submitting, setSubmitting] = useState(false);
  const [combatOver, setCombatOver] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [advancingLevel, setAdvancingLevel] = useState(false);

  // Display health: rendered in health bars, updated incrementally during animation
  const [displayPlayerHealth, setDisplayPlayerHealth] = useState<number>(0);
  const [displayMobHealth, setDisplayMobHealth] = useState<Record<string, number>>({});

  // Track the last processed round to avoid re-triggering animations
  const lastProcessedRound = useRef<number>(0);

  // Refs for sprite renderers — player + each mob
  const playerSpriteRef = useRef<SpriteRendererHandle>(null);
  const mobSpriteRefs = useRef<Map<string, SpriteRendererHandle>>(new Map());

  // Persistent sequencer instance
  const sequencerRef = useRef<CombatAnimationSequencer>(new CombatAnimationSequencer());

  const baseBodyUrl = `${import.meta.env.VITE_API_URL}/assets/gear/base-body.png`;

  // Derive gear layers from inventory (temporary until equip system is built)
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState?.inventory?.items) return [];
    return playerState.inventory.items
      .filter(inv => inv.item.type === 'GEAR' && inv.item.gearImageUrl)
      .map(inv => ({
        url: `${import.meta.env.VITE_API_URL}${inv.item.gearImageUrl}`,
        subType: inv.item.subType as GearSubType,
      }));
  }, [playerState?.inventory?.items]);

  /** Callback to store mob sprite refs from the render loop */
  const setMobSpriteRef = useCallback((mobId: string, handle: SpriteRendererHandle | null) => {
    if (handle) {
      mobSpriteRefs.current.set(mobId, handle);
    } else {
      mobSpriteRefs.current.delete(mobId);
    }
  }, []);

  /** Helper: show floating text on a target */
  const showDamageText = useCallback((event: DamageEvent) => {
    const color = FLOATING_TEXT_COLORS[event.type] || FLOATING_TEXT_COLORS.damage;
    const prefix = event.type === 'heal' ? '+' : '-';
    const text = `${prefix}${event.amount}`;

    if (event.targetId === 'player') {
      playerSpriteRef.current?.showFloatingText({ text, color, fontSize: 32 });
    } else {
      const mobRef = mobSpriteRefs.current.get(event.targetId);
      mobRef?.showFloatingText({ text, color, fontSize: 32 });
    }
  }, []);

  /** Helper: update display health for a damage event target */
  const applyDisplayDamage = useCallback((event: DamageEvent) => {
    if (event.targetId === 'player') {
      setDisplayPlayerHealth(prev => Math.max(0, prev - event.amount));
    } else {
      setDisplayMobHealth(prev => ({
        ...prev,
        [event.targetId]: Math.max(0, (prev[event.targetId] ?? 0) - event.amount),
      }));
    }
  }, []);

  // Initialize display health when battleState first loads (no animation needed)
  useEffect(() => {
    if (!battleState) return;
    // Only sync on initial load (round hasn't been processed yet and no animation running)
    if (lastProcessedRound.current === 0 && !animating) {
      setDisplayPlayerHealth(battleState.playerHealth);
      const mobHealth: Record<string, number> = {};
      battleState.mobs.forEach((m: MobBattleState) => { mobHealth[m.id] = m.health; });
      setDisplayMobHealth(mobHealth);
    }
  }, [battleState?.id]);

  useEffect(() => {
    // Always select Combat tab when CombatView mounts
    setActiveTab('Combat');

    if (!battleState && activeCharacter) {
      // No active battle — redirect back to home.
      navigate('/home');
      return;
    }

    if (battleState) {
      if (battleState.status === 'VICTORY' || battleState.status === 'DEFEAT') {
        setCombatOver(true);
      } else if (battleState.status === 'IN_PROGRESS') {
        // Reset when advancing to a new dungeon level
        setCombatOver(false);
      }
    }
  }, [battleState]);

  /**
   * Process damage events from the latest battle state and orchestrate the
   * combat animation sequence with synchronized health bars and chat logs.
   */
  useEffect(() => {
    if (!battleState?.damageEvents || battleState.damageEvents.length === 0) {
      // No damage events — sync display health directly (defend-only rounds, etc.)
      if (battleState && battleState.round > lastProcessedRound.current) {
        lastProcessedRound.current = battleState.round;
        setDisplayPlayerHealth(battleState.playerHealth);
        const mobHealth: Record<string, number> = {};
        battleState.mobs.forEach((m: MobBattleState) => { mobHealth[m.id] = m.health; });
        setDisplayMobHealth(mobHealth);
        // Push any turnLogs immediately for no-damage rounds
        if (battleState.turnLogs?.length) {
          addCombatLogs(battleState.turnLogs);
        }
        setSubmitting(false);
      }
      return;
    }
    if (battleState.round <= lastProcessedRound.current) return;

    // Mark this round as processed
    lastProcessedRound.current = battleState.round;

    const damageEvents = battleState.damageEvents;
    const turnLogs = battleState.turnLogs || [];

    // Pre-process: group turnLogs with their corresponding damage events
    const { systemLogs, eventGroups, trailingLogs } = groupLogsWithEvents(turnLogs, damageEvents);

    // Build the animation sequence
    const runAnimation = async () => {
      setAnimating(true);

      // Cancel any in-progress sequence
      sequencerRef.current.cancel();
      sequencerRef.current = new CombatAnimationSequencer();

      const steps: CombatAnimationStep[] = [];

      // Push system header logs at animation start
      if (systemLogs.length > 0) {
        steps.push({ type: 'effect', execute: () => addCombatLogs(systemLogs) });
      }

      // Build animation steps for each event group
      for (const { event, logs } of eventGroups) {
        const isPlayerAttacking = event.sourceId === 'player';

        if (isPlayerAttacking) {
          // Player attacks a mob
          const playerContainer = playerSpriteRef.current?.getContainer();
          const playerOrigin = playerSpriteRef.current?.getOriginPosition();
          
          const mobRef = mobSpriteRefs.current.get(event.targetId);
          const targetContainer = mobRef?.getContainer();

          if (playerContainer && targetContainer && playerOrigin) {
            steps.push(...buildAttackSteps({
              attacker: playerContainer,
              target: targetContainer,
              attackerOriginX: playerOrigin.x,
              attackerOriginY: playerOrigin.y,
              direction: 'right',
              onMoveStart: () => {
                playerSpriteRef.current?.playAnimation('walking');
              },
              onImpact: () => {
                playerSpriteRef.current?.playAnimation('attacking');
                showDamageText(event);
                applyDisplayDamage(event);
                addCombatLogs(logs);
              },
              onReturnIdle: () => {
                playerSpriteRef.current?.playAnimation('idle');
              },
            }));
          } else {
            // No Pixi containers — fire effects immediately
            steps.push({
              type: 'effect',
              execute: () => {
                showDamageText(event);
                applyDisplayDamage(event);
                addCombatLogs(logs);
              },
            });
            steps.push({ type: 'wait', duration: 200 });
          }
        } else {
          // Mob attacks the player
          const mobRef = mobSpriteRefs.current.get(event.sourceId!);
          const mobContainer = mobRef?.getContainer();
          const mobOrigin = mobRef?.getOriginPosition();
          
          const playerContainer = playerSpriteRef.current?.getContainer();

          if (mobContainer && playerContainer && mobOrigin) {
            steps.push(...buildAttackSteps({
              attacker: mobContainer,
              target: playerContainer,
              attackerOriginX: mobOrigin.x,
              attackerOriginY: mobOrigin.y,
              direction: 'left',
              onMoveStart: () => {
                mobRef?.playAnimation('walking');
              },
              onImpact: () => {
                mobRef?.playAnimation('attacking');
                showDamageText(event);
                applyDisplayDamage(event);
                addCombatLogs(logs);
              },
              onReturnIdle: () => {
                mobRef?.playAnimation('idle');
              },
            }));
          } else {
            steps.push({
              type: 'effect',
              execute: () => {
                showDamageText(event);
                applyDisplayDamage(event);
                addCombatLogs(logs);
              },
            });
            steps.push({ type: 'wait', duration: 200 });
          }
        }
      }

      // Push any trailing logs (defend-only actions, etc.)
      if (trailingLogs.length > 0) {
        steps.push({ type: 'effect', execute: () => addCombatLogs(trailingLogs) });
      }

      // Play the full sequence
      try {
        await sequencerRef.current.playSequence(steps);
      } catch (err) {
        console.warn('[CombatView] Animation sequence error:', err);
      }

      // After animation: sync display health to authoritative state (catches edge cases)
      setDisplayPlayerHealth(battleState.playerHealth);
      const finalMobHealth: Record<string, number> = {};
      battleState.mobs.forEach((m: MobBattleState) => { finalMobHealth[m.id] = m.health; });
      setDisplayMobHealth(finalMobHealth);

      setAnimating(false);
      setSubmitting(false);
    };

    runAnimation();
  }, [battleState?.round, battleState?.damageEvents, showDamageText, applyDisplayDamage, addCombatLogs]);

  const handleActionSelect = (mobId: string, action: CombatActionType) => {
    setPendingActions(prev => ({ ...prev, [mobId]: action }));
  };

  const handleLeaveCombat = async () => {
    sequencerRef.current.cancel();
    await sendGameEvent({ type: 'leave_combat' });
    navigate('/home');
  };

  const handleAdvanceLevel = async () => {
    if (!battleState?.nextDungeonLevelId) return;
    setAdvancingLevel(true);
    try {
      const result = await sendGameEvent({ type: 'advance_dungeon_level' });
      if (result.success) {
        // Reset combat state for new battle — the new battleState will arrive
        // via socket and trigger the useEffect/animation pipeline.
        setPendingActions({});
        setSubmitting(false);
        setAnimating(false);
        lastProcessedRound.current = 0;
        mobSpriteRefs.current.clear();
        sequencerRef.current.cancel();
      } else {
        console.error('[CombatView] Failed to advance level:', result.error);
        notificationService.error('Cannot advance level', result.error);
      }
    } catch (err: any) {
      console.error('[CombatView] Error advancing level:', err.message);
      notificationService.error('Error', err.message);
    } finally {
      setAdvancingLevel(false);
    }
  };

  const handleSubmitTurn = async () => {
    if (!battleState || submitting || animating || Object.keys(pendingActions).length === 0) return;

    setSubmitting(true);

    const aliveMobIds = battleState.mobs.filter((m: MobBattleState) => m.health > 0).map((m: MobBattleState) => m.id);
    const actionsArray = Object.entries(pendingActions)
      .filter(([targetId]) => aliveMobIds.includes(targetId))
      .map(([targetId, action]) => ({
        targetId,
        action
      }));

    try {
      await sendGameEvent({
        type: 'combat_action',
        actions: actionsArray
      });
      // Don't set submitting=false here — the animation sequence will do it when done
    } catch (err: any) {
      console.error('[CombatView] Failed to submit actions:', err);
      setSubmitting(false);
    }
  };

  if (!battleState || !activeCharacter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-400 font-bold tracking-widest uppercase animate-pulse">Initializing Combat...</p>
      </div>
    );
  }

  const actionableMobs = battleState.mobs.filter((m: MobBattleState) => m.health > 0);
  const allActionsSelected = actionableMobs.every((m: MobBattleState) => pendingActions[m.id]);
  const isInteractionDisabled = submitting || animating;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
      {/* Background / Environment layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />

      {/* Header Info */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md pointer-events-auto">
          <h2 className="text-xl font-black text-amber-500 uppercase">{activeCharacter.name}</h2>
          <div className="mt-2 w-48 h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-600">
            <div
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: `${Math.max(0, (displayPlayerHealth / battleState.playerMaxHealth) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-bold mt-1 text-right">{displayPlayerHealth} / {battleState.playerMaxHealth} HP</p>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 backdrop-blur-md flex flex-col items-end gap-2 pointer-events-auto">
          <h2 className="text-xl font-black text-slate-300 uppercase">Round {battleState.round}</h2>
          {!combatOver && (
            <button 
              onClick={handleLeaveCombat}
              className="px-4 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-900/50 rounded-lg transition-all active:scale-95 cursor-pointer shadow-lg"
            >
              Flee Combat
            </button>
          )}
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

        {/* Mobs Sprites */}
        <div className="w-1/2 relative flex flex-col items-center justify-center space-y-8">
          {battleState.mobs.map((mob: MobBattleState) => {
            const atlasConfig = mob.animations as any;
            const spriteUrl = atlasConfig?.url ? (atlasConfig.url.startsWith('http') ? atlasConfig.url : `${import.meta.env.VITE_API_URL}${atlasConfig.url}`) : null;
            const atlasUrl = atlasConfig?.atlasUrl ? (atlasConfig.atlasUrl.startsWith('http') ? atlasConfig.atlasUrl : `${import.meta.env.VITE_API_URL}${atlasConfig.atlasUrl}`) : null;
            const mobDisplayHealth = displayMobHealth[mob.id] ?? mob.health;
            const isDead = mobDisplayHealth <= 0;

            return (
              <div key={mob.id} className={`relative flex items-center gap-6 transition-all duration-1000 ${isDead ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100'}`}>
                <div
                  className={`relative flex items-center justify-center cursor-pointer transition-all duration-300 ${pendingActions[mob.id] ? '' : 'hover:opacity-80'}`}
                  onClick={() => !isInteractionDisabled && handleActionSelect(mob.id, pendingActions[mob.id] || 'Attack')}
                >
                  {/* Mob Health Bar */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 flex flex-col items-center z-20">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap drop-shadow-md bg-slate-900/50 px-2 py-0.5 rounded">{mob.name}</span>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-600 mt-1 shadow-lg">
                      <div
                        className="h-full bg-red-500 transition-all duration-300"
                        style={{ width: `${Math.max(0, (mobDisplayHealth / mob.maxHealth) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {spriteUrl && atlasUrl ? (
                    <SpriteRenderer
                      ref={(handle) => setMobSpriteRef(mob.id, handle)}
                      type="animated"
                      spriteUrl={spriteUrl}
                      atlasUrl={atlasUrl}
                      animationKey="idle"
                    />
                  ) : (
                    <div className="w-32 h-32 bg-slate-800 border-2 border-red-500/50 rounded flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                      <span className="text-slate-500 font-bold uppercase text-xs">No Sprite</span>
                    </div>
                  )}

                </div>

                {/* Action Buttons to the right */}
                <div className="flex flex-col gap-3 pointer-events-auto z-20">
                  <button
                    disabled={isInteractionDisabled}
                    onClick={() => handleActionSelect(mob.id, 'Attack')}
                    className={`px-6 py-2 rounded font-black uppercase tracking-widest text-xs transition-all cursor-pointer ${pendingActions[mob.id] === 'Attack' ? 'bg-red-600 text-white border border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-slate-900/90 text-slate-400 border border-slate-700 hover:bg-slate-800 backdrop-blur-sm'}`}
                  >
                    Attack
                  </button>
                  <button
                    disabled={isInteractionDisabled}
                    onClick={() => handleActionSelect(mob.id, 'Defend')}
                    className={`px-6 py-2 rounded font-black uppercase tracking-widest text-xs transition-all cursor-pointer ${pendingActions[mob.id] === 'Defend' ? 'bg-blue-600 text-white border border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-slate-900/90 text-slate-400 border border-slate-700 hover:bg-slate-800 backdrop-blur-sm'}`}
                  >
                    Defend
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </PixiStageProvider>

      {/* Combat Controls */}
      <div className="h-40 bg-slate-900 border-t border-slate-800 p-6 flex flex-col relative z-20 pointer-events-auto shrink-0">
        {combatOver ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            <h2 className={`text-4xl font-black uppercase tracking-widest ${battleState.status === 'VICTORY' ? 'text-amber-400' : 'text-red-500'}`}>
              {battleState.status === 'VICTORY' ? 'Victory!' : 'Defeat!'}
            </h2>
            <div className="flex items-center gap-4">
              {battleState.status === 'VICTORY' && battleState.nextDungeonLevelId ? (
                /* More levels remain — Next Level + Back Out */
                <>
                  <button
                    onClick={handleAdvanceLevel}
                    disabled={advancingLevel}
                    className="px-8 py-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(217,119,6,0.3)] transition-all active:scale-95 border border-amber-400 cursor-pointer"
                  >
                    {advancingLevel ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : 'Next Level'}
                  </button>
                  <button
                    onClick={handleLeaveCombat}
                    disabled={advancingLevel}
                    className="px-8 py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-black uppercase tracking-widest rounded-xl shadow-xl transition-all active:scale-95 border border-slate-600 cursor-pointer"
                  >
                    Back Out
                  </button>
                </>
              ) : battleState.status === 'VICTORY' && battleState.isDungeonComplete ? (
                /* Last level — Finish Dungeon */
                <button
                  onClick={handleLeaveCombat}
                  className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 border border-emerald-400 cursor-pointer"
                >
                  Finish Dungeon
                </button>
              ) : (
                /* Defeat or fallback */
                <button
                  onClick={handleLeaveCombat}
                  className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest rounded-xl shadow-xl transition-all active:scale-95 border border-slate-600 cursor-pointer"
                >
                  Back to City
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto">
            <button
              disabled={isInteractionDisabled || !allActionsSelected}
              onClick={handleSubmitTurn}
              className="w-full py-5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white text-xl font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(217,119,6,0.3)] transition-all active:scale-95 border border-amber-400 cursor-pointer mb-2"
            >
              {animating ? 'Fighting...' : submitting ? '...' : 'Submit Turn'}
            </button>
            <p className="text-[10px] text-slate-500 font-bold text-center uppercase tracking-widest">
              {animating ? 'Combat in progress' : !allActionsSelected ? 'Select actions for all targets' : 'Ready to strike'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
