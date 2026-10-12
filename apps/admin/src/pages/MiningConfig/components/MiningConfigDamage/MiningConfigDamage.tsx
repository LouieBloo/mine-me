import { MINING_CONFIG, computeSpeedDamage, type MiningMapConfigData } from '@mine-me/shared';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import './MiningConfigDamage.css';

interface DamageFieldDefinition {
  field: keyof MiningMapConfigData;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
}

/** One linear speed-damage rule shown as a group of three fields. */
interface DamageRuleDefinition {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: DamageFieldDefinition[];
}

export const FALL_DAMAGE_RULE: DamageRuleDefinition = {
  id: 'fall',
  title: 'Fall Damage',
  icon: '🪂',
  description:
    'Players take damage when they land hard: (impact speed - minimum speed) x damage per speed. Mobs are not affected. Speeds are in tiles per second; a normal jump lands at about 8.5.',
  fields: [
    {
      field: 'fallDamageMinSpeed',
      label: 'Minimum Impact Speed',
      help: 'No damage at or below this landing speed.',
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      field: 'fallDamagePerSpeed',
      label: 'Damage per Speed',
      help: 'Health lost for every tile/s above the minimum.',
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      field: 'fallDamageMax',
      label: 'Maximum Damage',
      help: 'Largest single fall hit. 0 means no cap.',
      min: 0,
      max: 10000,
      step: 1,
    },
  ],
};

export const ROCK_DAMAGE_RULE: DamageRuleDefinition = {
  id: 'rock',
  title: 'Falling Rock Damage',
  icon: '🪨',
  description:
    'A falling rock hurts the player it lands on: (rock speed - minimum speed) x damage per speed. A rock hurts each player once per fall. Speeds are in tiles per second; the longer a rock falls, the faster it goes.',
  fields: [
    {
      field: 'rockDamageMinSpeed',
      label: 'Minimum Rock Speed',
      help: 'No damage at or below this rock speed.',
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      field: 'rockDamagePerSpeed',
      label: 'Rock Damage per Speed',
      help: 'Health lost for every tile/s above the minimum.',
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      field: 'rockDamageMax',
      label: 'Rock Maximum Damage',
      help: 'Largest single rock hit. 0 means no cap.',
      min: 0,
      max: 10000,
      step: 1,
    },
  ],
};

const DAMAGE_RULES: DamageRuleDefinition[] = [FALL_DAMAGE_RULE, ROCK_DAMAGE_RULE];

/** Sample drops (in tiles) used for the "what would this do" preview. */
export const SAMPLE_DROP_TILES = [2, 4, 6, 10];

/** Sample rock speeds (tiles/s) used for the rock damage preview. */
export const SAMPLE_ROCK_SPEEDS = [8, 12, 20, 30];

/** Landing speed after falling `tiles` from rest, limited by terminal velocity. */
export function impactSpeedForDrop(tiles: number, gravity: number): number {
  return Math.min(Math.sqrt(2 * gravity * tiles), MINING_CONFIG.TERMINAL_FALL_SPEED);
}

/**
 * Environmental damage card: fall damage and falling rock damage. Each rule is
 * data, so adding one means adding a definition, not new markup.
 */
export default function MiningConfigDamage({ config, onFieldChange }: MiningConfigFieldProps) {
  const gravity = config.gravity ?? MINING_CONFIG.GRAVITY;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5" data-testid="damage-config">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>💥</span> Environmental Damage
        </h3>
        <p className="text-xs text-slate-500">Damage players take from the mine itself. Environmental hits ignore the short invulnerability after a mob hit.</p>
      </div>

      {DAMAGE_RULES.map(rule => (
        <div key={rule.id} className="space-y-3" data-testid={`damage-rule-${rule.id}`}>
          <div>
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>{rule.icon}</span> {rule.title}
            </h4>
            <p className="text-xs text-slate-500">{rule.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rule.fields.map(def => (
              <div key={def.field} className="space-y-1">
                <label htmlFor={def.field} className="text-sm font-semibold text-slate-700">
                  {def.label}
                </label>
                <input
                  id={def.field}
                  type="number"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={(config[def.field] as number | undefined) ?? 0}
                  onChange={e => onFieldChange(def.field, Number(e.target.value) as never)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">{def.help}</p>
              </div>
            ))}
          </div>

          {rule.id === 'rock' && (
            <div className="flex flex-wrap gap-2 text-xs" data-testid="rock-damage-preview">
              {SAMPLE_ROCK_SPEEDS.map(speed => {
                const damage = computeSpeedDamage(speed, {
                  minSpeed: config.rockDamageMinSpeed ?? 0,
                  perSpeed: config.rockDamagePerSpeed ?? 0,
                  max: config.rockDamageMax ?? 0,
                });
                return (
                  <span
                    key={speed}
                    className="px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-semibold"
                  >
                    {speed} tiles/s: {Math.round(damage)} dmg
                  </span>
                );
              })}
            </div>
          )}

          {rule.id === 'fall' && (
            <div className="flex flex-wrap gap-2 text-xs" data-testid="fall-damage-preview">
              {SAMPLE_DROP_TILES.map(tiles => {
                const speed = impactSpeedForDrop(tiles, gravity);
                const damage = computeSpeedDamage(speed, {
                  minSpeed: config.fallDamageMinSpeed ?? 0,
                  perSpeed: config.fallDamagePerSpeed ?? 0,
                  max: config.fallDamageMax ?? 0,
                });
                return (
                  <span
                    key={tiles}
                    className="px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-semibold"
                  >
                    {tiles}-tile drop: {Math.round(damage)} dmg
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
