import { BLOCK_SCALE } from '@mine-me/shared';
import {
  MiningTileType,
  ROCK_MASS_DAMAGE_EXPONENT,
  computeSpeedDamage,
  isTileSolid,
  knockbackAway,
  pieceCells,
  pieceFootprint,
  pieceOrigin,
  rockMass,
  type TileFootprint,
  type Vector2D,
} from '@mine-me/shared';
import { rockDamageRule } from '../environmentalDamage';
import { isInBounds } from '../../miningMap.service';
import { MiningRockEntity } from '../physics/MiningRockEntity';
import type { MiningWorld } from '../MiningWorld';

/** How far (tiles) beyond a falling rock's edge a player's center can be and still be hit. */
const CRUSH_MARGIN = 0.1;
/** The reach of a 1 x 1 rock, kept as it was when every rock was one cell (its half size plus the margin). */
const CRUSH_RADIUS = 0.5 + CRUSH_MARGIN;
/** A rock must be moving down faster than this (tiles/s) and have fallen this far (tiles) to count as falling. */
const CRUSH_MIN_DOWNWARD_SPEED = 2.0 * BLOCK_SCALE;
const CRUSH_MIN_FALL_DISTANCE = 0.5 * BLOCK_SCALE;
/** Sideways shove (tiles/s) away from the rock, so the player is not left standing inside it. */
const ROCK_HIT_KNOCKBACK = { x: 3 * BLOCK_SCALE, y: -1.5 * BLOCK_SCALE };

/** Whether `point` is inside the box centred on any spot of the segment `a`-`b`, with half sizes `halfW` x `halfH`. */
export function sweptBoxContains(point: Vector2D, a: Vector2D, b: Vector2D, halfW: number, halfH: number): boolean {
  // The box moves in a straight line, so the closest it gets to the point is where the point's offset is smallest
  // on each axis at the same moment; sampling every quarter cell is plenty at the speeds rocks fall
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (Math.abs(point.x - (a.x + (b.x - a.x) * t)) <= halfW && Math.abs(point.y - (a.y + (b.y - a.y) * t)) <= halfH) return true;
  }
  return false;
}

export class MiningRockSubsystem {
  public activeRocks: MiningRockEntity[] = [];
  public rockCounter = 0;

  constructor(private readonly world: MiningWorld) {}

  /** Rocks resting above a cleared tile start to fall (as a whole, when they are bigger than one cell). */
  public checkAndTriggerFallingRocks(clearedX: number, clearedY: number): void {
    this.releaseUnsupportedAbove(clearedX, clearedX, clearedY - 1);
  }

  /** The rock (anchor and size) that the ROCK tile at (x, y) belongs to; a tile with no piece is a 1 x 1 rock. */
  private rockAt(x: number, y: number): { anchor: { x: number; y: number }; footprint: TileFootprint } {
    const tile = this.world.grid[y][x];
    return { anchor: pieceOrigin(x, y, tile.piece), footprint: pieceFootprint(tile.type, tile.piece) };
  }

  /** A rock stays up while any cell under its bottom row is solid (or it sits on the floor of the map). */
  private isSupported(anchor: { x: number; y: number }, footprint: TileFootprint): boolean {
    const { grid } = this.world;
    const belowY = anchor.y + footprint.height;
    if (belowY >= grid.length) return true;
    for (let x = anchor.x; x < anchor.x + footprint.width; x++) {
      const tile = grid[belowY]?.[x];
      if (tile && isTileSolid(tile.type)) return true;
    }
    return false;
  }

  /**
   * Walks up each column from `fromY` and sets loose every rock that has lost its support. A rock that falls
   * takes the rocks resting on it along (they are checked over its whole width), and a rock that is still
   * held up stops the walk in that column, since whatever is above it is held too.
   */
  private releaseUnsupportedAbove(x0: number, x1: number, fromY: number): void {
    const { grid } = this.world;
    for (let x = x0; x <= x1; x++) {
      for (let y = fromY; y >= 0; y--) {
        const tile = grid[y]?.[x];
        if (!tile) break;
        if (tile.type === MiningTileType.ROCK) {
          const { anchor, footprint } = this.rockAt(x, y);
          if (this.isSupported(anchor, footprint)) break;
          this.releaseRock(anchor, footprint);
          this.releaseUnsupportedAbove(anchor.x, anchor.x + footprint.width - 1, anchor.y - 1);
          y = anchor.y; // carry on above the rock that was just released
        } else if (isTileSolid(tile.type)) {
          break;
        }
      }
    }
  }

  /** Turns a resting rock back into a falling body. */
  private releaseRock(anchor: { x: number; y: number }, footprint: TileFootprint): void {
    const { grid, rigidWorld } = this.world;
    for (const cell of pieceCells(anchor, footprint)) {
      grid[cell.y][cell.x] = { type: MiningTileType.EMPTY, revealed: true };
      rigidWorld.removeTileCollider(cell.x, cell.y);
      this.world.pushTileUpdate({ x: cell.x, y: cell.y, type: MiningTileType.EMPTY, damageStage: 0 });
    }

    this.rockCounter++;
    const rockId = `rock_${anchor.x}_${anchor.y}_${this.rockCounter}`;
    this.activeRocks.push(
      new MiningRockEntity(rockId, anchor.x, anchor.y, rigidWorld, {
        width: footprint.width,
        height: footprint.height,
        gravityScale: rigidWorld.config.rockGravityScale,
        restitution: rigidWorld.config.rockRestitution,
      })
    );
  }

  public updateFallingRocks(dt: number): void {
    if (this.activeRocks.length === 0) return;

    const { grid } = this.world;
    this.activeRocks = this.activeRocks.filter((rock) => {
      rock.update(dt, grid);

      this.crushPlayers(rock);

      if (rock.hasSettled && rock.settledTile) {
        this.landRock(rock);
        return false;
      }
      return true;
    });
  }

  /** Puts a rock that has come to rest back into the grid, as one piece when it is bigger than a cell. */
  private landRock(rock: MiningRockEntity): void {
    const { grid, rigidWorld } = this.world;
    const anchor = rock.settledTile!;
    const footprint = { width: rock.cellsWide, height: rock.cellsHigh };
    const isBig = footprint.width > 1 || footprint.height > 1;
    for (const cell of pieceCells(anchor, footprint, true)) {
      if (!isInBounds(cell.x, cell.y, grid)) continue;
      const piece = isBig ? cell.offset : undefined;
      grid[cell.y][cell.x] = { type: MiningTileType.ROCK, revealed: true, ...(piece ? { piece } : {}) };
      rigidWorld.addTileCollider(cell.x, cell.y);
      this.world.pushTileUpdate({ x: cell.x, y: cell.y, type: MiningTileType.ROCK, ...(piece ? { piece } : {}) });
    }
  }

  /**
   * Hurts every player the falling rock lands on, by the rock's speed (see `rockDamageRule`) times its mass, so
   * a big rock hurts more than a small one at the same speed. A rock hurts each player at most once per fall,
   * and nobody is hurt by a rock that is not really falling yet.
   */
  private crushPlayers(rock: MiningRockEntity): void {
    // A fast rock moves more than its own size per tick and can bounce off the floor in the same
    // step, so judge it by the speed it had on the way down and by the whole path it travelled.
    const speed = Math.max(rock.velocity.y, rock.previousVelocityY);
    if (speed <= CRUSH_MIN_DOWNWARD_SPEED || rock.totalFallenDistance <= CRUSH_MIN_FALL_DISTANCE) return;

    const rule = rockDamageRule(this.world.mapConfig);
    const mass = rockMass({ width: rock.cellsWide, height: rock.cellsHigh });
    const reachX = Math.max(CRUSH_RADIUS, rock.cellsWide / 2 + CRUSH_MARGIN);
    const reachY = Math.max(CRUSH_RADIUS, rock.cellsHigh / 2 + CRUSH_MARGIN);
    // A rock also crushes doodads with health (a bug on the floor under it), once per fall
    const damage = computeSpeedDamage(speed, rule) * Math.pow(mass, ROCK_MASS_DAMAGE_EXPONENT);
    if (damage > 0) {
      const box = { x0: rock.position.x - reachX, y0: Math.min(rock.previousPosition.y, rock.position.y) - reachY, x1: rock.position.x + reachX, y1: Math.max(rock.previousPosition.y, rock.position.y) + reachY };
      for (const target of this.world.doodads.hurtableInBox(box)) {
        if (rock.hitDoodadIds.has(target.id)) continue;
        rock.hitDoodadIds.add(target.id);
        this.world.damage.applyDamage({ kind: 'doodad', id: target.id }, { amount: damage, type: 'environmental', source: { kind: 'environment', id: rock.id, name: 'Falling rock' } });
      }
    }
    for (const session of this.world.players.values()) {
      if (rock.hitPlayerIds.has(session.characterId)) continue;
      const body = session.playerBody;
      if (!sweptBoxContains(body.position, rock.previousPosition, rock.position, reachX, reachY)) continue;

      const amount = computeSpeedDamage(speed, rule) * Math.pow(mass, ROCK_MASS_DAMAGE_EXPONENT);
      if (amount <= 0) continue;
      rock.hitPlayerIds.add(session.characterId);

      // A heavier rock shoves harder, but not in step with the damage (it would fling the player across the map)
      const shove = Math.sqrt(mass);
      this.world.damage.applyDamage(
        { kind: 'player', id: session.characterId },
        {
          amount,
          type: 'environmental',
          source: { kind: 'environment', id: rock.id, name: 'Falling rock' },
          ignoreInvulnerability: true,
          knockback: knockbackAway(rock.position.x, body.position.x, { x: ROCK_HIT_KNOCKBACK.x * shove, y: ROCK_HIT_KNOCKBACK.y * shove }),
        }
      );
    }
  }
}
