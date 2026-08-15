import { MINING_CONFIG, MiningTileType, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';
import { isInBounds } from '../../miningMap.service';

export interface PhysicsBodyOptions {
  position: Vector2D;
  radius?: number;
  hasGravity?: boolean;
  gravityScale?: number;
  mass?: number;
}

/**
 * Base class for all physics entities in the mining mini-game.
 * Handles continuous movement integration, gravity, and collision resolution against static grid tiles.
 */
export abstract class MiningPhysicsBody {
  public position: Vector2D;
  public velocity: Vector2D = { x: 0, y: 0 };
  public radius: number;
  public hasGravity: boolean;
  public gravityScale: number;
  public isGrounded: boolean = false;
  public mass: number;

  constructor(options: PhysicsBodyOptions) {
    this.position = { ...options.position };
    this.radius = options.radius ?? (MINING_CONFIG.PLAYER_RADIUS / MINING_CONFIG.TILE_SIZE);
    this.hasGravity = options.hasGravity ?? true;
    this.gravityScale = options.gravityScale ?? 1.0;
    this.mass = options.mass ?? 1.0;
  }

  /**
   * Applies an acceleration or velocity change to the body.
   */
  public applyImpulse(impulse: Vector2D): void {
    this.velocity.x += impulse.x / this.mass;
    this.velocity.y += impulse.y / this.mass;
  }

  /**
   * Physics simulation step for dt seconds.
   */
  public update(dt: number, grid: ServerMiningGrid): void {
    // 1. Apply gravity
    if (this.hasGravity) {
      this.velocity.y += MINING_CONFIG.GRAVITY * this.gravityScale * dt;
      if (this.velocity.y > MINING_CONFIG.TERMINAL_FALL_SPEED) {
        this.velocity.y = MINING_CONFIG.TERMINAL_FALL_SPEED;
      }
    }

    // 2. Perform separated horizontal and vertical collision checks
    let targetX = this.position.x + this.velocity.x * dt;
    let targetY = this.position.y + this.velocity.y * dt;

    // Boundaries clamping
    targetX = Math.max(this.radius, Math.min(MINING_CONFIG.GRID_WIDTH - 1 - this.radius, targetX));
    targetY = Math.max(this.radius, Math.min(MINING_CONFIG.GRID_HEIGHT - 1 - this.radius, targetY));

    // Horizontal Movement test
    if (!this.checkTileCollision(targetX, this.position.y, grid)) {
      this.position.x = targetX;
    } else {
      this.onCollideX();
      this.velocity.x = 0;
    }

    // Vertical Movement test
    if (!this.checkTileCollision(this.position.x, targetY, grid)) {
      this.position.y = targetY;
      this.isGrounded = false;
    } else {
      if (this.velocity.y > 0) {
        // Hitting the floor
        this.isGrounded = true;
        this.onGroundHit();
      } else if (this.velocity.y < 0) {
        // Hitting the ceiling
        this.onCeilingHit();
      }
      this.velocity.y = 0;
    }
  }

  /**
   * Collision check against solid unmined tiles.
   */
  public checkTileCollision(x: number, y: number, grid: ServerMiningGrid): boolean {
    const minTileX = Math.max(0, Math.floor(x - this.radius));
    const maxTileX = Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.floor(x + this.radius));
    const minTileY = Math.max(0, Math.floor(y - this.radius));
    const maxTileY = Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.floor(y + this.radius));

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        if (!isInBounds(tx, ty)) return true;
        const tile = grid[ty][tx];
        if (tile.type !== MiningTileType.EMPTY && tile.type !== MiningTileType.ENTRANCE) {
          return true;
        }
      }
    }
    return false;
  }

  protected onCollideX(): void {}
  protected onGroundHit(): void {}
  protected onCeilingHit(): void {}
}
