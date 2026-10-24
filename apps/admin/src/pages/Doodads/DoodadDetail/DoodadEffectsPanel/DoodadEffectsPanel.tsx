import React from 'react';
import type { DoodadLightConfig, ItemLightConfig } from '@mine-me/shared';
import { ItemLightEffectConfig } from '../../../../components/ItemLightEffectConfig/ItemLightEffectConfig';
import { hintClass, inputClass, labelClass, panelClass } from '../panelStyles';
import './DoodadEffectsPanel.css';

interface DoodadEffectsPanelProps {
  light: DoodadLightConfig | null;
  particleEffectId: string | null;
  particleEffects: Array<{ id: string; name: string }>;
  onLightChange: (light: DoodadLightConfig | null) => void;
  onParticleChange: (id: string | null) => void;
}

/** The light the doodad gives off and the particle effect it plays. Where each sits on the doodad is set in the preview. */
const DoodadEffectsPanel: React.FC<DoodadEffectsPanelProps> = ({ light, particleEffectId, particleEffects, onLightChange, onParticleChange }) => {
  // The light's place on the doodad belongs to the doodad, not to the light panel, so it is kept when the light is edited
  const handleLight = (next: ItemLightConfig | null) => {
    if (next === null) return onLightChange(null);
    onLightChange({ ...next, offsetX: light?.offsetX ?? 0, offsetY: light?.offsetY ?? 0 });
  };
  const missing = particleEffectId !== null && !particleEffects.some((p) => p.id === particleEffectId);

  return (
    <div className={`doodad-effects-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Light & Particles</h4>
        <p className="text-xs text-slate-500 font-medium">A doodad can light the cavern around it and play a particle effect (a leaky cave's drip splash, glowing spores). Both sit on the doodad's anchor point; move them in the preview.</p>
      </div>

      <ItemLightEffectConfig
        lightConfig={light}
        onChange={handleLight}
        title="Doodad Light"
        description="Lights the cavern around the doodad while it is near the player. A pulse or flicker motion makes the light pulse or flicker with it."
      />

      <div className="space-y-1 max-w-sm">
        <label htmlFor="doodad-particle" className={labelClass}>Particle Effect</label>
        <select id="doodad-particle" value={particleEffectId ?? ''} onChange={(e) => onParticleChange(e.target.value === '' ? null : e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="">No particles</option>
          {missing && <option value={particleEffectId!}>(missing effect)</option>}
          {particleEffects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className={hintClass}>From the Particle Effects library</span>
      </div>
    </div>
  );
};

export default DoodadEffectsPanel;
