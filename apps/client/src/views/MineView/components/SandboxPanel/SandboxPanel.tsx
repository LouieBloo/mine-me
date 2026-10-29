import React, { useRef, useState } from 'react';
import { SANDBOX_SIM_SPEEDS, WEATHER_IDS, WEATHER_TYPES, type SandboxDoodadOption, type SandboxMobOption, type SandboxStatus } from '@mine-me/shared';
import { LoadingSpinner } from '../../../../components/LoadingSpinner/LoadingSpinner';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';
import { MINE_TOOL, type SandboxToolSelection } from '../../sandbox/sandboxTool';
import './SandboxPanel.css';

export interface SandboxFluidOption {
  typeKey: string;
  name: string;
}

export interface SandboxGasOption {
  typeKey: string;
  name: string;
}

/** What the sandbox can do with the extractor and its belt. */
export interface SandboxExtractorTools {
  /** Named test scenes. */
  scenes: SandboxMobOption[];
  onSpawn: () => void;
  onDigBelt: (rows: number) => void;
  onSetCapacity: (capacity: number) => void;
  onFillBackpack: (quantity: number) => void;
  onLoadScene: (sceneId: string) => void;
}

/** What the sandbox can do with doodads (ticket 107). */
export interface SandboxDoodadTools {
  /** The kinds that can be placed by hand. */
  options: SandboxDoodadOption[];
  /** Named test scenes. */
  scenes: SandboxMobOption[];
  /** The generator's doodad pass runs on the map. */
  generated: boolean;
  onSetGeneration: (enabled: boolean) => void;
  onClear: () => void;
  onLoadScene: (sceneId: string) => void;
}

/** What the sandbox can do with missions (ticket 116). */
export interface SandboxMissionTools {
  /** The loaded missions that can be started (empty: only the test scenes). */
  options: SandboxMobOption[];
  /** Named test scenes. */
  scenes: SandboxMobOption[];
  /** The room has a mission running (the complete, restart and drop buttons need one). */
  active: boolean;
  onStart: (missionId: string) => void;
  onControl: (action: 'complete' | 'reset' | 'clear') => void;
  onLoadScene: (sceneId: string) => void;
}

/** What the sandbox can do with the surface above the ground (tickets 129-138). */
export interface SandboxSurfaceTools {
  /** The loaded environments that can be chosen (empty: only the built-in sky). */
  environments: SandboxMobOption[];
  /** The environment in use, by key. */
  environment?: string;
  /** Named test scenes (clear day, heavy rain, storm...). */
  scenes: SandboxMobOption[];
  /** The weather forced right now (null: the seeded one). */
  forcedWeather: string | null;
  onSetEnvironment: (key: string) => void;
  /** Forces a weather at a strength 0 to 1, or null to go back to the seeded weather. */
  onSetWeather: (weather: string | null, intensity: number) => void;
  onLightning: () => void;
  onLoadScene: (sceneId: string) => void;
}

export interface SandboxPanelProps {
  fluids: SandboxFluidOption[];
  /** The gases that can be released (absent or empty hides the gas tool). */
  gases?: SandboxGasOption[];
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
  /** The extractor tools (absent hides the section). */
  extractor?: SandboxExtractorTools;
  /** The doodad tools (absent or no kinds hides the section and the two mouse tools). */
  doodads?: SandboxDoodadTools;
  /** The mission tools (absent hides the section). */
  missions?: SandboxMissionTools;
  /** The surface tools: environment, weather, lightning and scenes (absent hides the section). */
  surface?: SandboxSurfaceTools;
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
  gases = [],
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
  extractor,
  doodads,
  missions,
  surface,
  onReset,
  onLeave,
  busy = false,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const { position, onPointerDown, consumeClick } = useDraggablePanel('sandboxPanelPosition', panelRef);
  const [fluidKey, setFluidKey] = useState(fluids[0]?.typeKey ?? '');
  const [gasKey, setGasKey] = useState(gases[0]?.typeKey ?? '');
  const [mobId, setMobId] = useState(mobs[0]?.id ?? '');
  const [sceneId, setSceneId] = useState('');
  const [doodadId, setDoodadId] = useState(doodads?.options[0]?.id ?? '');
  const [doodadSceneId, setDoodadSceneId] = useState('');
  const [missionId, setMissionId] = useState('');
  const [missionSceneId, setMissionSceneId] = useState('');
  const [capacity, setCapacityText] = useState('100');
  const [surfaceSceneId, setSurfaceSceneId] = useState('');
  const [weatherPick, setWeatherPick] = useState('');
  const [intensity, setIntensity] = useState(1);

  const selectedFluid = fluids.some((f) => f.typeKey === fluidKey) ? fluidKey : fluids[0]?.typeKey ?? '';
  const selectedGas = gases.some((g) => g.typeKey === gasKey) ? gasKey : gases[0]?.typeKey ?? '';
  const doodadOptions = doodads?.options ?? [];
  const selectedDoodad = doodadOptions.some((d) => d.id === doodadId) ? doodadId : doodadOptions[0]?.id ?? '';
  const selectedMob = mobs.some((m) => m.id === mobId) ? mobId : mobs[0]?.id ?? '';

  return (
    // Until it is dragged it sits on the right below the health panel, clear of the buttons in the top-right corner
    <aside
      ref={panelRef}
      className={`sandbox-panel absolute z-30 w-64 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-violet-500/40 bg-slate-900/90 text-slate-200 shadow-xl shadow-black/40 backdrop-blur ${position ? '' : 'top-64 right-3'}`}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        title="Drag to move"
        onClick={() => {
          if (consumeClick()) return;
          setCollapsed((c) => !c);
        }}
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
                className={`${BUTTON} ${tool.kind === 'releaseGas' ? ACTIVE : IDLE}`}
                onClick={() => onToolChange({ kind: 'releaseGas', gasKey: selectedGas })}
                disabled={freeCamera || gases.length === 0}
              >
                Release gas
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
              {doodadOptions.length > 0 && (
                <>
                  <button
                    type="button"
                    className={`${BUTTON} ${tool.kind === 'placeDoodad' ? ACTIVE : IDLE}`}
                    onClick={() => onToolChange({ kind: 'placeDoodad', doodadId: selectedDoodad })}
                    disabled={freeCamera}
                  >
                    Place doodad
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON} ${tool.kind === 'removeDoodad' ? ACTIVE : IDLE}`}
                    onClick={() => onToolChange({ kind: 'removeDoodad' })}
                    disabled={freeCamera}
                  >
                    Remove doodad
                  </button>
                  <button
                    type="button"
                    className={`${BUTTON} ${tool.kind === 'hitDoodad' ? ACTIVE : IDLE}`}
                    onClick={() => onToolChange({ kind: 'hitDoodad' })}
                    disabled={freeCamera}
                    title="Hits a doodad like a weapon: hurts it, kills it, or lets a hanging one fall"
                  >
                    Hit doodad
                  </button>
                </>
              )}
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
            {gases.length > 0 && (
              <select
                aria-label="Gas to release"
                className={SELECT}
                value={selectedGas}
                onChange={(e) => {
                  setGasKey(e.target.value);
                  if (tool.kind === 'releaseGas') onToolChange({ kind: 'releaseGas', gasKey: e.target.value });
                }}
              >
                {gases.map((g) => (
                  <option key={g.typeKey} value={g.typeKey}>
                    {g.name}
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

          {doodads && doodadOptions.length > 0 && (
            <section aria-label="Doodads" className="flex flex-col gap-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Doodads</h3>
              <select
                aria-label="Doodad to place"
                className={SELECT}
                value={selectedDoodad}
                onChange={(e) => {
                  setDoodadId(e.target.value);
                  if (tool.kind === 'placeDoodad') onToolChange({ kind: 'placeDoodad', doodadId: e.target.value });
                }}
              >
                {doodadOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.anchor.toLowerCase()})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">Click where the doodad touches: its feet, its hanging point, or the wall beside it.</p>
              <button
                type="button"
                className={`${BUTTON} ${doodads.generated ? ACTIVE : IDLE}`}
                aria-pressed={doodads.generated}
                onClick={() => doodads.onSetGeneration(!doodads.generated)}
                disabled={busy}
              >
                {doodads.generated ? 'Generated doodads on' : 'Generate doodads'}
              </button>
              <button type="button" className={`${BUTTON} ${IDLE}`} onClick={doodads.onClear} disabled={busy}>
                Remove all doodads
              </button>
              {doodads.scenes.length > 0 && (
                <div className="flex gap-1.5">
                  <select aria-label="Doodad scene" className={SELECT} value={doodadSceneId} onChange={(e) => setDoodadSceneId(e.target.value)}>
                    <option value="">Test scene...</option>
                    {doodads.scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => doodads.onLoadScene(doodadSceneId)} disabled={busy || doodadSceneId === ''}>
                    Load
                  </button>
                </div>
              )}
            </section>
          )}

          {missions && (missions.options.length > 0 || missions.scenes.length > 0) && (
            <section aria-label="Missions" className="flex flex-col gap-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Missions</h3>
              {missions.options.length > 0 && (
                <div className="flex gap-1.5">
                  <select aria-label="Mission to start" className={SELECT} value={missionId} onChange={(e) => setMissionId(e.target.value)}>
                    <option value="">Mission...</option>
                    {missions.options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => missions.onStart(missionId)} disabled={busy || missionId === ''}>
                    Start
                  </button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => missions.onControl('complete')} disabled={busy || !missions.active}>
                  Finish
                </button>
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => missions.onControl('reset')} disabled={busy || !missions.active}>
                  Restart
                </button>
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => missions.onControl('clear')} disabled={busy || !missions.active}>
                  Drop
                </button>
              </div>
              {missions.scenes.length > 0 && (
                <div className="flex gap-1.5">
                  <select aria-label="Mission scene" className={SELECT} value={missionSceneId} onChange={(e) => setMissionSceneId(e.target.value)}>
                    <option value="">Test scene...</option>
                    {missions.scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => missions.onLoadScene(missionSceneId)} disabled={busy || missionSceneId === ''}>
                    Load
                  </button>
                </div>
              )}
            </section>
          )}

          {surface && (
            <section aria-label="Surface" className="flex flex-col gap-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Surface and weather</h3>
              {surface.environments.length > 0 && (
                <select
                  aria-label="Surface environment"
                  className={SELECT}
                  value={surface.environment ?? ''}
                  onChange={(e) => surface.onSetEnvironment(e.target.value)}
                  disabled={busy}
                >
                  {surface.environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-1.5">
                <select aria-label="Weather" className={SELECT} value={weatherPick} onChange={(e) => setWeatherPick(e.target.value)}>
                  <option value="">Seeded weather</option>
                  {WEATHER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {WEATHER_TYPES[id].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${BUTTON} ${IDLE}`}
                  onClick={() => surface.onSetWeather(weatherPick === '' ? null : weatherPick, intensity)}
                  disabled={busy}
                >
                  Set
                </button>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-slate-400">
                Strength
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Weather strength"
                  className="flex-1 cursor-pointer"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                />
                <span className="w-8 text-right font-mono">{Math.round(intensity * 100)}%</span>
              </label>
              <button type="button" className={`${BUTTON} ${IDLE}`} onClick={surface.onLightning} disabled={busy}>
                Lightning strike
              </button>
              {surface.scenes.length > 0 && (
                <div className="flex gap-1.5">
                  <select aria-label="Surface scene" className={SELECT} value={surfaceSceneId} onChange={(e) => setSurfaceSceneId(e.target.value)}>
                    <option value="">Test scene...</option>
                    {surface.scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => surface.onLoadScene(surfaceSceneId)} disabled={busy || surfaceSceneId === ''}>
                    Load
                  </button>
                </div>
              )}
              <p className="text-[10px] text-slate-400">
                {surface.forcedWeather ? `Weather forced to ${WEATHER_TYPES[surface.forcedWeather as keyof typeof WEATHER_TYPES]?.label ?? surface.forcedWeather}.` : 'Weather follows the seed.'}
              </p>
            </section>
          )}

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
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fluid, gas and fire</h3>
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
              Clear fluid, gas and fire
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

          {extractor && (
            <section aria-label="Extractor" className="flex flex-col gap-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Extractor and belt</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={extractor.onSpawn} disabled={busy}>
                  Spawn extractor
                </button>
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => extractor.onDigBelt(10)} disabled={busy}>
                  Dig belt +10
                </button>
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => extractor.onFillBackpack(50)} disabled={busy}>
                  Fill pack
                </button>
                <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => extractor.onDigBelt(100)} disabled={busy}>
                  Dig belt to end
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={0}
                  aria-label="Carry capacity"
                  className={SELECT}
                  value={capacity}
                  onChange={(e) => setCapacityText(e.target.value)}
                />
                <button
                  type="button"
                  className={`${BUTTON} ${IDLE}`}
                  onClick={() => extractor.onSetCapacity(Number(capacity))}
                  disabled={busy || capacity.trim() === '' || !Number.isFinite(Number(capacity)) || Number(capacity) < 0}
                >
                  Set
                </button>
              </div>
              {extractor.scenes.length > 0 && (
                <div className="flex gap-1.5">
                  <select aria-label="Extractor scene" className={SELECT} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
                    <option value="">Test scene...</option>
                    {extractor.scenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={`${BUTTON} ${IDLE}`} onClick={() => extractor.onLoadScene(sceneId)} disabled={busy || sceneId === ''}>
                    Load
                  </button>
                </div>
              )}
            </section>
          )}

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
