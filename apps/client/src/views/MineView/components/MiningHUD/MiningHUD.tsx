import React, { useEffect, useState } from 'react';
import { type MiningSessionClientState, type PlayerState, MINING_CONFIG } from '@mine-me/shared';
import { ZoomControl } from '../ZoomControl/ZoomControl';
import './MiningHUD.css';

interface MiningHUDProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
  onAbandon: () => void;
  onRestart: () => void;
  isRestarting?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export const MiningHUD: React.FC<MiningHUDProps> = ({
  sessionState,
  playerState,
  onExit,
  onAbandon,
  onRestart,
  isRestarting = false,
  zoom = 1.0,
  onZoomChange,
}) => {
  const [miningProgress, setMiningProgress] = useState(0);

  // Derive stats
  const stamina = playerState.attributes?.stamina ?? 0;
  const maxStamina = playerState.attributes?.maxStamina ?? 100;
  const health = playerState.attributes?.health ?? 0;
  const maxHealth = playerState.attributes?.maxHealth ?? 100;

  // Local state loop for mining progress bar
  useEffect(() => {
    if (!sessionState.isMining || !sessionState.miningTimeMs || !sessionState.miningStartedAt) {
      setMiningProgress(0);
      return;
    }

    let frameId: number;
    const start = sessionState.miningStartedAt;
    const total = sessionState.miningTimeMs;

    const update = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / total) * 100);
      setMiningProgress(pct);

      if (pct < 100) {
        frameId = requestAnimationFrame(update);
      }
    };

    update();
    return () => cancelAnimationFrame(frameId);
  }, [sessionState.isMining, sessionState.miningTimeMs, sessionState.miningStartedAt]);

  const handleExitClick = () => {
    if (sessionState.canExtract) {
      onExit();
    } else {
      if (confirm('Are you sure you want to abandon the mine? All items in your temporary backpack will be lost!')) {
        onAbandon();
      }
    }
  };

  return (
    <div className="mining-hud-overlay absolute inset-0 flex flex-col justify-between p-6 pointer-events-none select-none">
      {/* Top HUD Row */}
      <div className="flex justify-between items-start w-full">
        {/* Top Left: Location/Title & Zoom Control */}
        <div className="flex flex-col gap-2.5 pointer-events-auto">
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md flex flex-col gap-1 w-64">
            <h2 className="text-lg font-black text-amber-500 tracking-widest uppercase">Subterranean Mine</h2>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>City: {playerState.cityId}</span>
              <span>Vision: {sessionState.visionRange}</span>
            </div>
            {sessionState.isMining && (
              <div className="text-[10px] text-amber-400 font-black animate-pulse uppercase tracking-wider mt-1">
                ⛏️ Excavating block...
              </div>
            )}
          </div>

          {/* Camera Zoom Control Widget */}
          {onZoomChange && (
            <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />
          )}
        </div>

        {/* Top Right: Refresh Button & Health/Stamina Panel */}
        <div className="flex flex-col items-end gap-2.5 pointer-events-auto">
          {/* Refresh New Game Button */}
          <button
            onClick={onRestart}
            disabled={isRestarting}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:text-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-xl backdrop-blur-md hover:shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Force reload into a brand new mining game"
          >
            <span className={`text-xs ${isRestarting ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-300'}`}>
              🔄
            </span>
            <span>{isRestarting ? 'Generating...' : 'Refresh Mine'}</span>
          </button>

          {/* Health & Stamina Panel */}
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md flex flex-col gap-3 w-72">
            {/* Health Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                <span className="text-rose-400">Health</span>
                <span className="text-slate-300">{health} / {maxHealth}</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-rose-600 transition-all duration-300 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  style={{ width: `${Math.max(0, (health / maxHealth) * 100)}%` }}
                />
              </div>
            </div>

            {/* Stamina Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                <span className="text-emerald-400">Stamina</span>
                <span className="text-slate-300">{stamina} / {maxStamina}</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  style={{ width: `${Math.max(0, (stamina / maxStamina) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer to push controls to bottom */}
      <div className="flex-1 w-full pointer-events-none" />

      {/* Bottom HUD Row */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Mining Progress Bar */}
        {sessionState.isMining && (
          <div className="w-96 bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 items-center">
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest animate-pulse">
              ⛏️ MINING IN PROGRESS
            </span>
            <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-75 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                style={{ width: `${miningProgress}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase">
              {Math.round(miningProgress)}%
            </span>
          </div>
        )}

        {/* Buttons and Legend row */}
        <div className="flex justify-between items-center w-full pointer-events-none">
          {/* Keyboard Controls Guide */}
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider pointer-events-auto">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">W</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">A</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">S</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">D</kbd>
              <span>Move</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <span className="text-amber-400">Left Click</span>
              <span>Mine</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">Space</kbd>
              <span>Jump</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">1-4</kbd>
              <span className="text-amber-400">Quick Slots</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">F</kbd>
              <span>Flashlight</span>
            </span>
            <span className="text-slate-700">|</span>
            <span>Exit at ({MINING_CONFIG.ENTRANCE_X}, {MINING_CONFIG.ENTRANCE_Y})</span>
          </div>

          {/* Leave/Extract Button */}
          <button
            onClick={handleExitClick}
            className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest border transition-all active:scale-95 cursor-pointer shadow-2xl pointer-events-auto ${
              sessionState.canExtract
                ? 'bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-pulse'
                : 'bg-red-950/40 hover:bg-red-900/60 text-red-400 border-red-900/50 hover:border-red-500/50'
            }`}
          >
            {sessionState.canExtract ? 'Extract & Leave' : 'Abandon Mine'}
          </button>
        </div>
      </div>
    </div>
  );
};
