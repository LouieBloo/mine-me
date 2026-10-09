/**
 * Every kind of effect an Effect row can have (one boolean flag each). Adding a new kind of
 * effect means adding it here, in the Prisma schema, and in the server's effect controller.
 */
export interface EffectKind {
  flag: string;
  /** Checkbox label in the effect editor. */
  label: string;
  /** Column header / compact name. */
  short: string;
  /** Badge colours (Tailwind) used when listing an item's effects. */
  badge: string;
}

export const EFFECT_KINDS: readonly EffectKind[] = [
  { flag: 'damageModifier', label: 'Damage Modifier (Weapon damage to mobs: melee and projectiles)', short: 'Damage', badge: 'text-rose-800 bg-rose-100 border border-rose-200' },
  { flag: 'toolDamageModifier', label: 'Tool Damage (damage to blocks per swing)', short: 'Tool Damage', badge: 'text-orange-800 bg-orange-100 border border-orange-200' },
  { flag: 'pickPowerModifier', label: 'Pick Power (hardest block this tool can break)', short: 'Pick Power', badge: 'text-violet-800 bg-violet-100 border border-violet-200' },
  { flag: 'knockbackModifier', label: 'Knockback (melee push, tenths of tiles/s; 45 = 4.5)', short: 'Knockback', badge: 'text-cyan-800 bg-cyan-100 border border-cyan-200' },
  { flag: 'miningSpeedModifier', label: 'Mining Speed Modifier (swing / attack speed)', short: 'Mining Speed', badge: 'text-amber-800 bg-amber-100 border border-amber-200' },
  { flag: 'healthGain', label: 'Grants Health Gain', short: 'Health Gain', badge: 'text-emerald-800 bg-emerald-100 border border-emerald-200' },
  { flag: 'staminaGain', label: 'Grants Stamina Gain', short: 'Stamina Gain', badge: 'text-blue-800 bg-blue-100 border border-blue-200' },
  { flag: 'explodes', label: 'Explodes', short: 'Explodes', badge: 'text-slate-700 bg-slate-100 border border-slate-200' },
];

export const DEFAULT_EFFECT_FLAGS: Record<string, boolean> = Object.fromEntries(
  EFFECT_KINDS.map((k) => [k.flag, false])
);

/** The first kind an effect has, in display order (undefined for an effect with no flags). */
export function getEffectKind(effect: Record<string, any> | null | undefined): EffectKind | undefined {
  if (!effect) return undefined;
  return EFFECT_KINDS.find((k) => effect[k.flag]);
}

/** Compact summary such as "(Damage)(Pick Power)" for dropdown options. */
export function describeEffectKinds(effect: Record<string, any> | null | undefined): string {
  if (!effect) return '';
  return EFFECT_KINDS.filter((k) => effect[k.flag]).map((k) => `(${k.short})`).join('');
}
