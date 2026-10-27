import {
  BLOCK_SCALE,
  ROCK_MASS_DAMAGE_EXPONENT,
  computeSpeedDamage,
  doodadFallMass,
  doodadPlacedSize,
  isTileSolid,
  knockbackAway,
  stepFall,
  type DoodadDefinition,
  type DoodadHurtBox,
  type DoodadPlacement,
  type DoodadShatterWire,
  type FallingDoodadWire,
  type FallingState,
} from '@mine-me/shared';
import { rockDamageRule } from '../environmentalDamage';
import type { MiningWorld } from '../MiningWorld';
import type { DoodadHitTarget } from './MiningDoodadSubsystem';

/** Sideways shove (cells/s) away from a falling doodad; the same as a falling rock's, scaled by the square root of its mass. */
const FALL_HIT_KNOCKBACK = { x: 3 * BLOCK_SCALE, y: -1.5 * BLOCK_SCALE };

/** What the falling doodads need of the subsystem that owns them. */
export interface FallingDoodadHost {
  readonly definitions: readonly DoodadDefinition[];
  hurtableInBox(box: DoodadHurtBox): DoodadHitTarget[];
}

/** A ceiling doodad in the air. */
export interface FallingDoodad {
  /** Unique in the room, small, so it can go on the wire. */
  id: number;
  typeIndex: number;
  variant: number;
  flip: boolean;
  def: DoodadDefinition;
  state: FallingState;
  /** How heavy it is, which scales the damage (see `doodadFallMass`). */
  mass: number;
  /** Who it has already hurt, so one fall hurts each of them at most once. */
  hitPlayers: Set<string>;
  hitMobs: Set<string>;
  hitDoodads: Set<string>;
}

/**
 * Ceiling doodads in the air (ticket 143): a stalactite or icicle that lost its block (or its health) drops, hurts every
 * player, mob and doodad it passes through, and shatters when it lands. Not a rock: it never turns back into a block.
 * Moved by the pure shared `stepFall`; this class only asks the room what is solid and who is in the way.
 */
export class MiningFallingDoodads {
  public list: FallingDoodad[] = [];
  private nextId = 1;
  private shattered: DoodadShatterWire[] = [];

  constructor(private readonly world: MiningWorld, private readonly host: FallingDoodadHost) {}

  /** Lets a doodad go: it starts falling from where it hung. */
  public release(placement: DoodadPlacement, def: DoodadDefinition): void {
    const size = doodadPlacedSize(def, placement.variant);
    this.list.push({
      id: this.nextId++,
      typeIndex: placement.typeIndex,
      variant: placement.variant,
      flip: placement.flip,
      def,
      state: { x: placement.x, y: placement.y, width: size.width, height: size.height, vy: 0 },
      mass: doodadFallMass(def, size),
      hitPlayers: new Set(),
      hitMobs: new Set(),
      hitDoodads: new Set(),
    });
  }

  /** Moves everything that is falling, hurts what it meets and lets the ones that landed shatter. */
  public update(dt: number): void {
    if (this.list.length === 0) return;
    const { grid } = this.world;
    const rows = grid.length;
    const isSolid = (x: number, y: number): boolean => {
      const tile = grid[y]?.[x];
      return !tile || isTileSolid(tile.type);
    };
    const falling = this.list;
    this.list = [];
    for (const item of falling) {
      const before = item.state;
      const { state, landed } = stepFall(before, dt, isSolid, rows);
      item.state = state;
      this.hurtThingsInTheWay(item, before.y);
      if (landed) {
        this.shattered.push([item.typeIndex, item.variant, item.flip ? 1 : 0, state.x, state.y]);
      } else {
        this.list.push(item);
      }
    }
  }

  /** The ones in the air, as the wire carries them. */
  public toWire(item: FallingDoodad): FallingDoodadWire {
    return [item.id, item.typeIndex, item.variant, item.flip ? 1 : 0, Math.round(item.state.x * 100) / 100, Math.round(item.state.y * 100) / 100];
  }

  /** Where doodads broke up since the last call, then forgets them. */
  public takeShattered(): DoodadShatterWire[] {
    const out = this.shattered;
    this.shattered = [];
    return out;
  }

  /** Hurts whoever the doodad passed through on its way from `fromY` to where it is now. */
  private hurtThingsInTheWay(item: FallingDoodad, fromY: number): void {
    const { state } = item;
    const sweep: DoodadHurtBox = { x0: state.x, x1: state.x + state.width, y0: fromY, y1: state.y + state.height };
    const amount = computeSpeedDamage(state.vy, rockDamageRule(this.world.mapConfig)) * Math.pow(item.mass, ROCK_MASS_DAMAGE_EXPONENT);
    if (amount <= 0) return;
    const source = { kind: 'environment' as const, id: `falling_doodad_${item.id}`, name: `Falling ${item.def.name.toLowerCase()}` };
    const centreX = (sweep.x0 + sweep.x1) / 2;
    // A heavier doodad shoves harder, but not in step with the damage
    const shove = Math.sqrt(item.mass);
    const knockbackFor = (x: number) => knockbackAway(centreX, x, { x: FALL_HIT_KNOCKBACK.x * shove, y: FALL_HIT_KNOCKBACK.y * shove });

    for (const session of this.world.players.values()) {
      if (session.isDead || item.hitPlayers.has(session.characterId)) continue;
      const body = session.playerBody;
      if (!overlaps(sweep, body.position.x, body.position.y, body.halfWidth, body.halfHeight)) continue;
      item.hitPlayers.add(session.characterId);
      this.world.damage.applyDamage(
        { kind: 'player', id: session.characterId },
        { amount, type: 'environmental', source, ignoreInvulnerability: true, knockback: knockbackFor(body.position.x) }
      );
    }
    for (const mob of Array.from(this.world.mobs.activeMobs.values())) {
      if (mob.health <= 0 || item.hitMobs.has(mob.id)) continue;
      const body = mob.mobBody;
      if (!overlaps(sweep, body.position.x, body.position.y, body.halfWidth, body.halfHeight)) continue;
      item.hitMobs.add(mob.id);
      this.world.damage.applyDamage({ kind: 'mob', id: mob.id }, { amount, type: 'environmental', source, knockback: knockbackFor(body.position.x) });
    }
    for (const target of this.host.hurtableInBox(sweep)) {
      if (item.hitDoodads.has(target.id)) continue;
      item.hitDoodads.add(target.id);
      this.world.damage.applyDamage({ kind: 'doodad', id: target.id }, { amount, type: 'environmental', source });
    }
  }
}

function overlaps(box: DoodadHurtBox, x: number, y: number, halfWidth: number, halfHeight: number): boolean {
  return x + halfWidth > box.x0 && x - halfWidth < box.x1 && y + halfHeight > box.y0 && y - halfHeight < box.y1;
}
