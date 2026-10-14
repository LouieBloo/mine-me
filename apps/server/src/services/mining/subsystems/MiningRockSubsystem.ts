import { MiningTileType, computeSpeedDamage, isTileSolid, knockbackAway, type Vector2D } from '@mine-me/shared';
import { rockDamageRule } from '../environmentalDamage';
import { isInBounds } from '../../miningMap.service';
import { MiningRockEntity } from '../physics/MiningRockEntity';
import type { MiningWorld } from '../MiningWorld';

/** How close (tiles) a falling rock's center must be to a player's to hit them. */
const CRUSH_RADIUS = 0.6;
/** A rock must be moving down faster than this (tiles/s) and have fallen this far (tiles) to count as falling. */
const CRUSH_MIN_DOWNWARD_SPEED = 2.0;
const CRUSH_MIN_FALL_DISTANCE = 0.5;
/** Sideways shove (tiles/s) away from the rock, so the player is not left standing inside it. */
const ROCK_HIT_KNOCKBACK = { x: 3, y: -1.5 };

/** Shortest distance from `point` to the line segment `a`-`b`. */
export function distanceToSegment(point: Vector2D, a: Vector2D, b: Vector2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
  return Math.hypot(point.x - (a.x + t * abx), point.y - (a.y + t * aby));
}

export class MiningRockSubsystem {
  public activeRocks: MiningRockEntity[] = [];
  public rockCounter = 0;

  constructor(private readonly world: MiningWorld) {}

  /** Rocks resting above a cleared tile start to fall. */
  public checkAndTriggerFallingRocks(clearedX: number, clearedY: number): void {
    const { grid, rigidWorld } = this.world;
    for (let y = clearedY - 1; y >= 0; y--) {
      if (grid[y][clearedX].type === MiningTileType.ROCK) {
        grid[y][clearedX] = { type: MiningTileType.EMPTY, revealed: true };
        rigidWorld.removeTileCollider(clearedX, y);
        this.world.pushTileUpdate({ x: clearedX, y, type: MiningTileType.EMPTY, damageStage: 0 });

        this.rockCounter++;
        const rockId = `rock_${clearedX}_${y}_${this.rockCounter}`;
        const rockEntity = new MiningRockEntity(rockId, clearedX, y, rigidWorld, {
          gravityScale: rigidWorld.config.rockGravityScale,
          restitution: rigidWorld.config.rockRestitution,
        });
        this.activeRocks.push(rockEntity);
      } else if (isTileSolid(grid[y][clearedX].type)) {
        break;
      }
    }
  }

  public updateFallingRocks(dt: number): void {
    if (this.activeRocks.length === 0) return;

    const { grid, rigidWorld } = this.world;
    this.activeRocks = this.activeRocks.filter((rock) => {
      rock.update(dt, grid);

      this.crushPlayers(rock);

      if (rock.hasSettled && rock.settledTile) {
        const { x, y } = rock.settledTile;
        if (isInBounds(x, y, this.world.grid)) {
          grid[y][x] = { type: MiningTileType.ROCK, revealed: true };
          rigidWorld.addTileCollider(x, y);
          this.world.pushTileUpdate({ x, y, type: MiningTileType.ROCK });
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Hurts every player the falling rock lands on, by the rock's speed (see `rockDamageRule`).
   * A rock hurts each player at most once per fall, and nobody is hurt by a rock that is not
   * really falling yet.
   */
  private crushPlayers(rock: MiningRockEntity): void {
    // A fast rock moves more than its own size per tick and can bounce off the floor in the same
    // step, so judge it by the speed it had on the way down and by the whole path it travelled.
    const speed = Math.max(rock.velocity.y, rock.previousVelocityY);
    if (speed <= CRUSH_MIN_DOWNWARD_SPEED || rock.totalFallenDistance <= CRUSH_MIN_FALL_DISTANCE) return;

    const rule = rockDamageRule(this.world.mapConfig);
    for (const session of this.world.players.values()) {
      if (rock.hitPlayerIds.has(session.characterId)) continue;
      const body = session.playerBody;
      if (distanceToSegment(body.position, rock.previousPosition, rock.position) >= CRUSH_RADIUS) continue;

      const amount = computeSpeedDamage(speed, rule);
      if (amount <= 0) continue;
      rock.hitPlayerIds.add(session.characterId);

      this.world.damage.applyDamage(
        { kind: 'player', id: session.characterId },
        {
          amount,
          type: 'environmental',
          source: { kind: 'environment', id: rock.id, name: 'Falling rock' },
          ignoreInvulnerability: true,
          knockback: knockbackAway(rock.position.x, body.position.x, ROCK_HIT_KNOCKBACK),
        }
      );
    }
  }
}
