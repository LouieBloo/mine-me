import React, { useEffect, useState } from 'react';
import { type MiningSessionClientState, type PlayerState } from '@mine-me/shared';
import { ZoomControl } from '../ZoomControl/ZoomControl';
import { QuickAccessBar } from '../../../../components/QuickAccessBar/QuickAccessBar';
import { BeltStatus } from '../BeltStatus/BeltStatus';
import { MissionTracker } from '../MissionTracker/MissionTracker';
import { TemporaryBackpack } from '../TemporaryBackpack/TemporaryBackpack';
import { PerformanceOverlay } from '../PerformanceOverlay/PerformanceOverlay';
import { BiomeDebugOverlay } from '../BiomeDebugOverlay/BiomeDebugOverlay';
import './MiningHUD.css';

interface MiningHUDProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onRestart: () => void;
  isRestarting?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showDebug?: boolean;
  onToggleDebug?: () => void;
}

export const MiningHUD: React.FC<MiningHUDProps> = ({
  sessionState,
  playerState,
  onRestart,
  isRestarting = false,
  zoom = 1.0,
  onZoomChange,
  showDebug = false,
  onToggleDebug,
}) => {
  const [miningProgress, setMiningProgress] = useState(0);

  // Derive stats
  const stamina = playerState.attributes?.stamina ?? 0;
  const maxStamina = playerState.attributes?.maxStamina ?? 100;
  const health = playerState.attributes?.health ?? 0;
  const maxHealth = playerState.attributes?.maxHealth ?? 100;

  // Local state loop for mining progress bar
  useEffect(() => {
    if (!sessionState.isMining || !sessionState.miningTotal || !sessionState.miningStartedAt) {
      setMiningProgress(0);
      return;
    }

    let frameId: number;
    const start = sessionState.miningStartedAt;
    const total = sessionState.miningTotal;

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
  }, [sessionState.isMining, sessionState.miningTotal, sessionState.miningStartedAt]);

  return (
    <div className="mining-hud-overlay absolute inset-0 flex flex-col justify-between p-6 pointer-events-none select-none">
      {/* Top HUD Row */}
      <div className="flex justify-between items-start w-full">
        {/* Top Left: Hotbar, Temporary Backpack & Zoom Control (on demand) */}
        <div className="flex flex-col items-start gap-2.5 pointer-events-none">
          <div className="pointer-events-auto">
            <QuickAccessBar />
          </div>

          {/* Temporary Backpack */}
          <div className="pointer-events-auto">
            <TemporaryBackpack
              items={sessionState.temporaryBackpack || []}
              weight={sessionState.backpackWeight}
              capacity={sessionState.backpackCapacity}
              stash={sessionState.stash}
            />
          </div>

          {sessionState.mission && (
            <div className="pointer-events-auto">
              <MissionTracker mission={sessionState.mission} />
            </div>
          )}

          {sessionState.belt && sessionState.belt.rows + (sessionState.belt.blockedBy ? 1 : 0) > 0 && (
            <div className="pointer-events-auto">
              <BeltStatus rows={sessionState.belt.rows} blockedBy={sessionState.belt.blockedBy} />
            </div>
          )}

          {/* Camera Zoom Control (appears on zoom, fades after a few seconds) */}
          {onZoomChange && (
            <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />
          )}
        </div>

        {/* Top Right: Debug Button, Refresh Button & Health/Stamina Panel */}
        <div className="flex flex-col items-end gap-2.5 pointer-events-auto">
          <div className="flex items-center gap-2">
            {/* Debug Mode Toggle Button */}
            {onToggleDebug && (
              <button
                onClick={onToggleDebug}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-xl backdrop-blur-md border ${
                  showDebug
                    ? 'bg-emerald-950/90 border-emerald-500 text-emerald-400 hover:bg-emerald-900 shadow-emerald-500/20'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-500 hover:bg-slate-800'
                }`}
                title="Toggle Debug Hitboxes & Reach Overlays (or press B)"
              >
                <span>{showDebug ? '🟢' : '⚪'}</span>
                <span>{showDebug ? 'Hitboxes ON' : 'Hitboxes'}</span>
              </button>
            )}

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
          </div>

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
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">1-0</kbd>
              <span className="text-amber-400">Quick Slots</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">F</kbd>
              <span>Flashlight</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">B</kbd>
              <span className={showDebug ? 'text-emerald-400 font-bold' : ''}>Hitboxes</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">I</kbd>
              <span>Backpack</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-slate-200">E</kbd><span className="text-emerald-400">Leave (at the EXIT sign)</span></span>
          </div>
        </div>
      </div>
      <PerformanceOverlay />
      <BiomeDebugOverlay />
    </div>
  );
};
