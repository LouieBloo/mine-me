import React from 'react';
import type { ItemLightConfig, LightType, LightEffectMode } from '@mine-me/shared';
import './ItemLightEffectConfig.css';

interface ItemLightEffectConfigProps {
  lightConfig?: ItemLightConfig | null;
  onChange: (config: ItemLightConfig | null) => void;
}

const DEFAULT_CONFIG: ItemLightConfig = {
  enabled: true,
  type: 'POINT',
  effect: 'PULSE',
  color: '#fbbf24',
  radius: 1.8,
  intensity: 0.45,
  pulseSpeed: 2.5,
  minIntensity: 0.3,
  maxIntensity: 0.6,
  flickerSpeed: 12,
  flickerAmount: 0.2,
  spotAngle: 90,
  spotConeAngle: 45,
};

const COLOR_PRESETS = [
  { name: 'Sol Gold', hex: '#fbbf24' },
  { name: 'Radiant Amber', hex: '#f59e0b' },
  { name: 'Crystal Cyan', hex: '#38bdf8' },
  { name: 'Torch Flame', hex: '#ef4444' },
  { name: 'Emerald Gem', hex: '#10b981' },
  { name: 'Celestial Violet', hex: '#c084fc' },
  { name: 'Pure White', hex: '#ffffff' },
];

export const ItemLightEffectConfig: React.FC<ItemLightEffectConfigProps> = ({
  lightConfig,
  onChange,
}) => {
  const isEnabled = Boolean(lightConfig?.enabled);
  const current: ItemLightConfig = { ...DEFAULT_CONFIG, ...(lightConfig || {}) };

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      onChange(lightConfig ? { ...current, enabled: false } : null);
    } else {
      onChange({ ...current, enabled: true });
    }
  };

  const update = (patch: Partial<ItemLightConfig>) => {
    onChange({ ...current, ...patch, enabled: true });
  };

  const pulseDuration = `${Math.max(0.5, 6 / (current.pulseSpeed || 2.5))}s`;
  const flickerDuration = `${Math.max(0.05, 2.5 / (current.flickerSpeed || 12))}s`;

  return (
    <div className="item-light-config-card bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
            💡
          </div>
          <div>
            <h4 className="font-black text-base tracking-wide text-amber-400">In-Game Light Effect</h4>
            <p className="text-xs text-slate-400">
              Dynamically illuminates cavern darkness when dropped on the mine floor
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 px-4 py-2 rounded-xl transition-colors">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-200">
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {isEnabled && (
        <div className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Light Type & Effect Mode */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Light Shape / Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['POINT', 'SPOT'] as LightType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update({ type })}
                      className={`cursor-pointer px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all border ${
                        current.type === type
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                          : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {type === 'POINT' ? '🌕 Omnidirectional Point' : '🔦 Directional Spot'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Lighting Animation Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['STATIC', 'PULSE', 'FLICKER'] as LightEffectMode[]).map((eff) => (
                    <button
                      key={eff}
                      type="button"
                      onClick={() => update({ effect: eff })}
                      className={`cursor-pointer px-3 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all border ${
                        current.effect === eff
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                          : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {eff === 'STATIC' && 'Steady'}
                      {eff === 'PULSE' && 'Pulse'}
                      {eff === 'FLICKER' && 'Flicker'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Configuration */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Light Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={current.color}
                    onChange={(e) => update({ color: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-slate-700 bg-slate-800 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={current.color}
                    onChange={(e) => update({ color: e.target.value })}
                    className="flex-1 p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-200 uppercase"
                    placeholder="#fbbf24"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => update({ color: p.hex })}
                      className="cursor-pointer text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                      title={p.name}
                    >
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.hex }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Sliders & Live Preview */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Radius ({current.radius.toFixed(1)} tiles)
                  </label>
                  <span className="text-[11px] font-mono text-amber-400 font-bold">
                    {(current.radius * 64).toFixed(0)} px
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={current.radius}
                  onChange={(e) => update({ radius: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Base Brightness / Intensity ({(current.intensity * 100).toFixed(0)}%)
                  </label>
                  <span className="text-[11px] font-mono text-amber-400 font-bold">
                    {current.intensity.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={current.intensity}
                  onChange={(e) => update({ intensity: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Mode-Specific Settings */}
              {current.effect === 'PULSE' && (
                <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-300">
                    <span>Pulse Speed</span>
                    <span className="text-amber-400 font-mono">{(current.pulseSpeed ?? 2.5).toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="8.0"
                    step="0.5"
                    value={current.pulseSpeed ?? 2.5}
                    onChange={(e) => update({ pulseSpeed: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}

              {current.effect === 'FLICKER' && (
                <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-300">
                    <span>Flicker Speed</span>
                    <span className="text-amber-400 font-mono">{current.flickerSpeed ?? 12}</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="24"
                    step="1"
                    value={current.flickerSpeed ?? 12}
                    onChange={(e) => update({ flickerSpeed: parseInt(e.target.value, 10) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Live Preview Box */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Cavern Illumination Preview
                </label>
                <div
                  className="item-light-preview-box h-28 w-full"
                  style={
                    {
                      '--pulse-dur': pulseDuration,
                      '--flicker-dur': flickerDuration,
                      '--min-opacity': `${current.minIntensity ?? current.intensity * 0.7}`,
                      '--max-opacity': `${current.maxIntensity ?? current.intensity * 1.3}`,
                      '--base-opacity': `${current.intensity}`,
                    } as React.CSSProperties
                  }
                >
                  {/* Subtle Grid Lines to represent cave terrain tiles */}
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]" />

                  {/* Animated Light Glow Disc */}
                  <div
                    className={`item-light-glow-disk ${
                      current.effect === 'PULSE'
                        ? 'item-light-anim-pulse'
                        : current.effect === 'FLICKER'
                        ? 'item-light-anim-flicker'
                        : ''
                    }`}
                    style={{
                      width: `${Math.min(180, current.radius * 36)}px`,
                      height: `${Math.min(180, current.radius * 36)}px`,
                      background: `radial-gradient(circle, ${current.color} 0%, ${current.color}66 35%, transparent 75%)`,
                      opacity: current.intensity,
                    }}
                  />
                  <div className="relative z-10 text-[10px] font-mono text-slate-400 bg-slate-950/70 px-2.5 py-0.5 rounded-full border border-slate-800">
                    {current.type} • {current.effect} • {current.color}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemLightEffectConfig;
