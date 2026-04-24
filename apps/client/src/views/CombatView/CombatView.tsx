import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Application } from '@pixi/react';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useChat } from '../../contexts/ChatContext';
import { MobSprite } from '../../components/game/MobSprite/MobSprite';
import './CombatView.css';
import type { CombatActionType, MobBattleState } from '@nvg/shared';

const MobSpriteRenderer: React.FC<{ spriteUrl: string, atlasUrl: string, animationKey: string }> = ({ spriteUrl, atlasUrl, animationKey }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixiApp, setPixiApp] = useState<any>(null);
  const mobSpriteRef = useRef<MobSprite | null>(null);

  useEffect(() => {
    if (pixiApp?.stage) {
      if (mobSpriteRef.current) {
        mobSpriteRef.current.destroy();
        mobSpriteRef.current = null;
      }

      const mobSprite = new MobSprite(pixiApp.stage, spriteUrl, atlasUrl);
      mobSprite.load().then(() => {
        mobSprite.setPosition(128, 128);
        mobSprite.setScale(2);
        mobSprite.playAnimation(animationKey);
        mobSpriteRef.current = mobSprite;
      });
    }

    return () => {
      if (mobSpriteRef.current) {
        mobSpriteRef.current.destroy();
        mobSpriteRef.current = null;
      }
    };
  }, [pixiApp, spriteUrl, atlasUrl]);

  useEffect(() => {
    if (mobSpriteRef.current) {
      mobSpriteRef.current.playAnimation(animationKey);
    }
  }, [animationKey]);

  return (
    <div ref={containerRef} className="w-64 h-64 relative">
      <Application width={256} height={256} backgroundAlpha={0} onInit={(app) => setPixiApp(app)} />
    </div>
  );
};

export const CombatView: React.FC = () => {
  const { battleState, activeCharacter } = useGame();
  const { sendGameEvent } = useSocket();
  const { setActiveTab, clearCombatLogs } = useChat();
  const navigate = useNavigate();

  // pendingActions maps mob.id -> 'Attack' | 'Defend'
  const [pendingActions, setPendingActions] = useState<Record<string, CombatActionType>>({});
  const [submitting, setSubmitting] = useState(false);
  const [combatOver, setCombatOver] = useState(false);

  useEffect(() => {
    const initCombat = async () => {
      // Always select Combat tab when CombatView mounts
      setActiveTab('Combat');

      if (!battleState && activeCharacter) {
        clearCombatLogs();
        await sendGameEvent({ type: 'start_combat', cityId: activeCharacter.cityId });
      }
    };
    
    initCombat();

    if (battleState) {
      if (battleState.status === 'VICTORY' || battleState.status === 'DEFEAT') {
        setCombatOver(true);
      }
    }
  }, [battleState]);

  const handleActionSelect = (mobId: string, action: CombatActionType) => {
    setPendingActions(prev => ({ ...prev, [mobId]: action }));
  };

  const handleLeaveCombat = async () => {
    await sendGameEvent({ type: 'leave_combat' });
    navigate('/home');
  };

  const handleSubmitTurn = async () => {
    if (!battleState || submitting || Object.keys(pendingActions).length === 0) return;

    setSubmitting(true);

    const actionsArray = Object.entries(pendingActions).map(([targetId, action]) => ({
      targetId,
      action
    }));

    try {
      await sendGameEvent({
        type: 'combat_action',
        actions: actionsArray
      });
      // Clear pending actions for the next round
      setPendingActions({});
    } catch (err: any) {
      console.error('[CombatView] Failed to submit actions:', err);
    } finally {
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

  const aliveMobs = battleState.mobs.filter((m: MobBattleState) => m.health > 0);
  const allActionsSelected = aliveMobs.every((m: MobBattleState) => pendingActions[m.id]);

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
              style={{ width: `${Math.max(0, (battleState.playerHealth / battleState.playerMaxHealth) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-bold mt-1 text-right">{battleState.playerHealth} / {battleState.playerMaxHealth} HP</p>
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
      <div className="flex-1 relative flex overflow-hidden">
        {/* Player Sprite Placeholder */}
        <div className="w-1/2 flex items-center justify-center">
          <div className="w-32 h-64 bg-slate-700 rounded-full blur-xl absolute bottom-1/4 opacity-50"></div>
          <img
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${activeCharacter.name}`}
            alt="Player"
            className="w-48 h-48 drop-shadow-2xl z-10 scale-x-[-1]"
          />
        </div>

        {/* Mobs Sprites */}
        <div className="w-1/2 relative flex flex-col items-center justify-center space-y-8">
          {aliveMobs.map((mob: MobBattleState) => {
            const atlasConfig = mob.animations as any;
            const spriteUrl = atlasConfig?.url ? (atlasConfig.url.startsWith('http') ? atlasConfig.url : `${import.meta.env.VITE_API_URL}${atlasConfig.url}`) : null;
            const atlasUrl = atlasConfig?.atlasUrl ? (atlasConfig.atlasUrl.startsWith('http') ? atlasConfig.atlasUrl : `${import.meta.env.VITE_API_URL}${atlasConfig.atlasUrl}`) : null;

            return (
              <div
                key={mob.id}
                className={`relative flex items-center justify-center cursor-pointer transition-all duration-300 ${pendingActions[mob.id] ? 'ring-2 ring-red-500/50 rounded-full' : 'hover:opacity-80'}`}
                onClick={() => handleActionSelect(mob.id, pendingActions[mob.id] || 'Attack')}
              >
                {/* Mob Health Bar */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 flex flex-col items-center z-20">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap drop-shadow-md bg-slate-900/50 px-2 py-0.5 rounded">{mob.name}</span>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-600 mt-1 shadow-lg">
                    <div
                      className="h-full bg-red-500 transition-all duration-300"
                      style={{ width: `${Math.max(0, (mob.health / mob.maxHealth) * 100)}%` }}
                    />
                  </div>
                </div>

                {spriteUrl && atlasUrl ? (
                  <MobSpriteRenderer
                    spriteUrl={spriteUrl}
                    atlasUrl={atlasUrl}
                    animationKey={submitting ? "attacking" : "idle"}
                  />
                ) : (
                  <div className="w-32 h-32 bg-slate-800 border-2 border-red-500/50 rounded flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                    <span className="text-slate-500 font-bold uppercase text-xs">No Sprite</span>
                  </div>
                )}

                {/* Selection Indicator */}
                {pendingActions[mob.id] && (
                  <div className="absolute -bottom-4 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter animate-bounce z-20 shadow-lg border border-red-400">
                    Targeted: {pendingActions[mob.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Combat Controls */}
      <div className="h-64 bg-slate-900 border-t border-slate-800 p-6 flex flex-col relative z-20 pointer-events-auto">
        {combatOver ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            <h2 className={`text-4xl font-black uppercase tracking-widest ${battleState.status === 'VICTORY' ? 'text-amber-400' : 'text-red-500'}`}>
              {battleState.status === 'VICTORY' ? 'Victory!' : 'Defeat!'}
            </h2>
            <button
              onClick={handleLeaveCombat}
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest rounded-xl shadow-xl transition-all active:scale-95 border border-slate-600"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="flex-1 flex max-w-5xl mx-auto w-full gap-6">
            <div className="flex-1 flex flex-col">
              <h3 className="text-slate-400 font-black uppercase tracking-widest mb-4">Select Actions</h3>
              <div className="flex-1 overflow-y-auto min-h-[120px] space-y-3 custom-scrollbar pr-2">
                {aliveMobs.map((mob: MobBattleState) => (
                  <div key={mob.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex items-center justify-between">
                    <div className="font-bold text-slate-200">{mob.name}</div>
                    <div className="flex space-x-2">
                      <button
                        disabled={submitting}
                        onClick={() => handleActionSelect(mob.id, 'Attack')}
                        className={`px-6 py-2 rounded font-black uppercase tracking-widest transition-all cursor-pointer ${pendingActions[mob.id] === 'Attack' ? 'bg-red-600 text-white border border-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-800'}`}
                      >
                        Attack
                      </button>
                      <button
                        disabled={submitting}
                        onClick={() => handleActionSelect(mob.id, 'Defend')}
                        className={`px-6 py-2 rounded font-black uppercase tracking-widest transition-all cursor-pointer ${pendingActions[mob.id] === 'Defend' ? 'bg-blue-600 text-white border border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-800'}`}
                      >
                        Defend
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-48 flex flex-col justify-end">
              <button
                disabled={submitting || !allActionsSelected}
                onClick={handleSubmitTurn}
                className="w-full py-8 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(217,119,6,0.3)] transition-all active:scale-95 border border-amber-400 cursor-pointer h-fit mb-1"
              >
                {submitting ? '...' : 'Submit Turn'}
              </button>
              <p className="text-[10px] text-slate-500 font-bold text-center uppercase tracking-tighter mt-2">
                {!allActionsSelected ? 'Select all targets' : 'Ready to strike'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
