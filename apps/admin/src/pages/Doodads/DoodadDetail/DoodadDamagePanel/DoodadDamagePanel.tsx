import React from 'react';
import type { DoodadAnchor } from '@mine-me/shared';
import { hintClass, inputClass, labelClass, panelClass, readNumber, show, smallInputClass } from '../panelStyles';
import './DoodadDamagePanel.css';

interface DoodadDamagePanelProps {
  anchor: DoodadAnchor;
  /** Hit points; null = it cannot be hurt. */
  health: number | null;
  /** Mass while falling (ceiling doodads); null = from its footprint. */
  fallDamage: number | null;
  deathParticleEffectId: string | null;
  particleEffects: Array<{ id: string; name: string }>;
  onHealthChange: (health: number | null) => void;
  onFallDamageChange: (fallDamage: number | null) => void;
  onDeathEffectChange: (id: string | null) => void;
}

/** A number box that is null while empty. */
const nullableNumber = (raw: string): number | null => {
  const n = readNumber(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * Whether the player can hurt the doodad (ticket 143). With Health it dies like a mob when bullets, swings, blasts or falling
 * rocks use it up; without, hits pass through it. A ceiling doodad also falls when the block above it is gone, and hurts what it lands on.
 */
const DoodadDamagePanel: React.FC<DoodadDamagePanelProps> = ({ anchor, health, fallDamage, deathParticleEffectId, particleEffects, onHealthChange, onFallDamageChange, onDeathEffectChange }) => {
  const missing = deathParticleEffectId !== null && !particleEffects.some((p) => p.id === deathParticleEffectId);

  return (
    <div className={`doodad-damage-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Damage</h4>
        <p className="text-xs text-slate-500 font-medium">Leave Health empty for scenery that cannot be hurt. With Health, bullets, swings, blasts and falling rocks hurt it, and it dies like a mob (no drops, no XP). A wandering bug can be hit anywhere it may stray to.</p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-1">
          <label htmlFor="doodad-health" className={labelClass}>Health</label>
          <input id="doodad-health" type="number" min={1} step={1} placeholder="Cannot be hurt" value={show(health)} onChange={(e) => onHealthChange(nullableNumber(e.target.value))} className={`${smallInputClass} w-40`} />
          <span className={hintClass}>Whole hit points, empty = unhurtable</span>
        </div>

        {anchor === 'CEILING' && (
          <div className="space-y-1">
            <label htmlFor="doodad-fall-damage" className={labelClass}>Fall Damage (mass)</label>
            <input id="doodad-fall-damage" type="number" min={0} step="any" placeholder="From its size" value={show(fallDamage)} onChange={(e) => onFallDamageChange(nullableNumber(e.target.value))} className={`${smallInputClass} w-40`} />
            <span className={hintClass}>Scales the damage when it falls; empty = like a rock of its size</span>
          </div>
        )}
      </div>

      {anchor === 'CEILING' && (
        <p className={hintClass}>A ceiling doodad always falls when the block it hangs from is removed. With Health it also falls when shot down, and shatters when it lands.</p>
      )}

      <div className="space-y-1 max-w-sm">
        <label htmlFor="doodad-death-particle" className={labelClass}>Death Effect</label>
        <select id="doodad-death-particle" value={deathParticleEffectId ?? ''} onChange={(e) => onDeathEffectChange(e.target.value === '' ? null : e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="">No effect</option>
          {missing && <option value={deathParticleEffectId!}>(missing effect)</option>}
          {particleEffects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className={hintClass}>Plays where it dies or shatters. The Hit and Death sounds are set under Sounds.</span>
      </div>
    </div>
  );
};

export default DoodadDamagePanel;
