import React, { useState } from 'react';
import { SANDBOX_SIM_SPEEDS, type SandboxMobOption, type SandboxStatus } from '@mine-me/shared';
import { LoadingSpinner } from '../../../../components/LoadingSpinner/LoadingSpinner';
import { MINE_TOOL, type SandboxToolSelection } from '../../sandbox/sandboxTool';
import './SandboxPanel.css';

export interface SandboxFluidOption {
  typeKey: string;
  name: string;
}

export interface SandboxPanelProps {
  fluids: SandboxFluidOption[];
  mobs: SandboxMobOption[];
  tool: SandboxToolSelection;
  onToolChange: (tool: SandboxToolSelection) => void;
  freeCamera: boolean;
  onFreeCameraChange: (enabled: boolean) => void;
  status: SandboxStatus;
  onGodMode: (enabled: boolean) => void;
  onPausedChange: (paused: boolean) => void;
  onStep: () => void;
  onSpeedChange: (speed: number) => void;
  onClearHazards: () => void;
  onReset: () => void;
  onLeave: () => void;
  /** A command is in flight: the shared spinner shows and the buttons wait. */
  busy?: boolean;
}

const BUTTON =
  'px-2 py-1.5 rounded-md border text-[11px] font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const IDLE = 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500';
const ACTIVE = 'bg-violet-600 border-violet-300 text-white hover:bg-violet-500';
const SELECT =
  'w-full px-2 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-xs text-slate-200 cursor-pointer hover:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400';

/** The sandbox's tool panel: what the mouse does, the free camera, simulation controls and reset. */
export const SandboxPanel: React.FC<SandboxPanelProps> = ({
  fluids,
  mobs,
  tool,
  onToolChange,
  freeCamera,
  onFreeCameraChange,
  status,
  onGodMode,
  onPausedChange,
  onStep,
  onSpeedChange,
  onClearHazards,
  onReset,
  onLeave,
  busy = false,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [fluidKey, setFluidKey] = useState(fluids[0]?.typeKey ?? '');
  const [mobId, setMobId] = useState(mobs[0]?.id ?? '');

  const selectedFluid = fluids.some((f) => f.typeKey === fluidKey) ? fluidKey : fluids[0]?.typeKey ?? '';
  const selectedMob = mobs.some((m) => m.id === mobId) ? mobId : mobs[0]?.id ?? '';

  return (
    <aside className="sandbox-panel absolute top-3 right-3 z-30 w-64 rounded-xl border border-violet-500/40 bg-slate-900/90 text-slate-200 shadow-xl shadow-black/40 backdrop-blur">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-black uppercase tracking-widest text-violet-300 cursor-pointer hover:text-violet-200"
        aria-expanded={!collapsed}
      >
        <span>🧪 Sandbox</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <section aria-label="Mouse tool" className="flex flex-col gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Left click</h3>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={`${BUTTON} ${tool.kind === 'mine' ? ACTIVE : IDLE}`}
                onClick={() => onToolChange(MINE_TOOL)}
                disabled={freeCamera}
              >
                Normal
              </button>
              <button
                type="button"
                className={`${BUTTON} ${tool.kind === 'pour' ? ACTIVE : IDLE}`}
                onClick={() => onToolChange({ kind: 'pour', fluidKey: selectedFluid })}
                disabled={freeCamera || fluids.length === 0}
              >
                Pour fluid
              </button>
              <button
                type="button"
                className={`${BUTTON} ${tool.kind === 'spawn' ? ACTIVE : IDLE}`}
                onClick={() => onToolChange({ kind: 'spawn', mobId: selectedMob })}
                disabled={freeCamera || mobs.length === 0}
              >
                Spawn mob
              </button>
              <button
                type="button"
                className={`${BUTTON} ${tool.kind === 'ignite' ? ACTIVE : IDLE}`}
                onClick={() => onToolChange({ kind: 'ignite' })}
                disabled={freeCamera}
              >
                Light fire
              </button>
            </div>
            {fluids.length > 0 && (
              <select
                aria-label="Fluid to pour"
                className={SELECT}
                value={selectedFluid}
                onChange={(e) => {
                  setFluidKey(e.target.value);
                  if (tool.kind === 'pour') onToolChange({ kind: 'pour', fluidKey: e.target.value });
                }}
              >
                {fluids.map((f) => (
                  <option key={f.typeKey} value={f.typeKey}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {mobs.length > 0 && (
              <select
                aria-label="Mob to spawn"
                className={SELECT}
                value={selectedMob}
                onChange={(e) => {
                  setMobId(e.target.value);
                  if (tool.kind === 'spawn') onToolChange({ kind: 'spawn', mobId: e.target.value });
                }}
              >
                {mobs.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </section>

          <section aria-label="Camera" className="flex flex-col gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Camera</h3>
            <button
              type="button"
              className={`${BUTTON} ${freeCamera ? ACTIVE : IDLE}`}
              aria-pressed={freeCamera}
              onClick={() => onFreeCameraChange(!freeCamera)}
            >
              {freeCamera ? 'Free camera on' : 'Free camera'}
            </button>
            {freeCamera && <p className="text-[10px] text-slate-400">WASD / arrows or drag to look around. The character stays put.</p>}
          </section>

          <section aria-label="Simulation" className="flex flex-col gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fluid and fire</h3>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={`${BUTTON} ${status.paused ? ACTIVE : IDLE}`}
                aria-pressed={status.paused}
                onClick={() => onPausedChange(!status.paused)}
                disabled={busy}
              >
                {status.paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className={`${BUTTON} ${IDLE}`} onClick={onStep} disabled={busy || !status.paused}>
                Step
              </button>
            </div>
            <select
              aria-label="Simulation speed"
              className={SELECT}
              value={status.speed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              disabled={busy}
            >
              {SANDBOX_SIM_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x speed
                </option>
              ))}
            </select>
            <button type="button" className={`${BUTTON} ${IDLE}`} onClick={onClearHazards} disabled={busy}>
              Clear fluid and fire
            </button>
          </section>

          <section aria-label="Player" className="flex flex-col gap-1.5">
            <button
              type="button"
              className={`${BUTTON} ${status.godMode ? ACTIVE : IDLE}`}
              aria-pressed={status.godMode}
              onClick={() => onGodMode(!status.godMode)}
              disabled={busy}
            >
              {status.godMode ? 'God mode on' : 'God mode'}
            </button>
          </section>

          <section aria-label="Sandbox" className="flex flex-col gap-1.5 border-t border-slate-700/60 pt-2">
            <button
              type="button"
              className={`${BUTTON} bg-amber-700/80 border-amber-400/60 text-amber-50 hover:bg-amber-600`}
              onClick={onReset}
              disabled={busy}
            >
              Reset sandbox
            </button>
            <button type="button" className={`${BUTTON} ${IDLE}`} onClick={onLeave} disabled={busy}>
              Leave sandbox
            </button>
          </section>

          {busy && (
            <div className="h-8" data-testid="sandbox-busy">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
