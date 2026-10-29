import type { TileFootprint } from './pieces';

/**
 * One size of rock the mine generator can place. A rock is a piece (see pieces.ts) of `width` x `height` cells
 * that mines, falls and hurts as one object. Adding a size is one line in ROCK_SHAPES.
 */
export interface RockShape extends TileFootprint {
  /** Name for logs and tests. */
  id: string;
  /** How likely this size is compared with the others (relative, not a percentage). */
  weight: number;
}

/**
 * The rock sizes the generator picks from: small rocks are common, a 3x3 boulder is rare. There is no 1x1 for now (it looked
 * odd as a lone block); add `{ id: '1x1', width: 1, height: 1, weight: 45 }` back to bring it back.
 */
export const ROCK_SHAPES: readonly RockShape[] = [
  { id: '2x1', width: 2, height: 1, weight: 20 },
  { id: '3x1', width: 3, height: 1, weight: 12 },
  { id: '2x2', width: 2, height: 2, weight: 15 },
  { id: '3x3', width: 3, height: 3, weight: 8 },
];

/** A rock's mass, from the cells it covers (the same density everywhere, so a 3x3 weighs nine 1x1 rocks). */
export function rockMass(footprint: TileFootprint): number {
  return Math.max(1, footprint.width * footprint.height);
}

/**
 * How strongly a rock's mass multiplies the damage it does (damage = speed damage x mass ^ this). 1 means a 3x3
 * rock hits nine times as hard as a 1x1 at the same speed; lower it to flatten the difference between sizes.
 */
export const ROCK_MASS_DAMAGE_EXPONENT = 1;

/**
 * Picks a shape by weight. `roll` is a random number in [0, 1); `fits` (optional) limits the choice to shapes
 * that can still be placed (e.g. within the remaining cell budget).
 */
export function pickRockShape(roll: number, fits: (shape: RockShape) => boolean = () => true, shapes: readonly RockShape[] = ROCK_SHAPES): RockShape | null {
  const options = shapes.filter(fits);
  const total = options.reduce((sum, s) => sum + s.weight, 0);
  if (options.length === 0 || total <= 0) return null;
  let at = roll * total;
  for (const shape of options) {
    at -= shape.weight;
    if (at < 0) return shape;
  }
  return options[options.length - 1];
}
