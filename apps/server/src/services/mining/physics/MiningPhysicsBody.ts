import { MINING_CONFIG, MiningTileType, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';
import { isInBounds } from '../../miningMap.service';

export interface PhysicsBodyOptions {
  position: Vector2D;
  radius?: number;
  width?: number; // In tile units
  height?: number; // In tile units
  hasGravity?: boolean;
  gravityScale?: number;
  mass?: number;
}

/**
 * Base class for all physics entities in the mining mini-game.
 * Handles continuous movement integration, gravity, and AABB rectangular collision resolution against static grid tiles.
 */
export abstract class MiningPhysicsBody {
  public position: Vector2D;
  public velocity: Vector2D = { x: 0, y: 0 };
  public halfWidth: number;
  public halfHeight: number;
  public radius: number;
  public hasGravity: boolean;
  public gravityScale: number;
  public isGrounded: boolean = false;
  public mass: number;

  constructor(options: PhysicsBodyOptions) {
    this.position = { ...options.position };
    if (options.width !== undefined && options.height !== undefined) {
      this.halfWidth = options.width / 2;
      this.halfHeight = options.height / 2;
    } else if (options.radius !== undefined) {
      this.halfWidth = options.radius;
      this.halfHeight = options.radius;
    } else {
      this.halfWidth = (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE) / 2;
      this.halfHeight = (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE) / 2;
    }
    this.radius = Math.max(this.halfWidth, this.halfHeight);
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

    // Boundaries clamping:
    // X is clamped between [halfWidth, GRID_WIDTH - halfWidth]
    // Y allows jumping freely up into the open sky (e.g. up to y = -50), and is clamped at the bedrock bottom
    targetX = Math.max(this.halfWidth, Math.min(MINING_CONFIG.GRID_WIDTH - this.halfWidth, targetX));
    targetY = Math.max(-50, Math.min(MINING_CONFIG.GRID_HEIGHT - this.halfHeight, targetY));

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
        // Hitting the floor -> ground the body and snap to top surface of floor tile
        this.isGrounded = true;
        const floorTileY = Math.floor(targetY + this.halfHeight);
        this.position.y = Math.min(this.position.y, floorTileY - this.halfHeight);
        this.onGroundHit();
      } else if (this.velocity.y < 0) {
        // Hitting the ceiling -> stop upward momentum and snap under ceiling
        const ceilingTileY = Math.floor(targetY - this.halfHeight);
        this.position.y = Math.max(this.position.y, ceilingTileY + 1.0 + this.halfHeight);
        this.onCeilingHit();
      }
      this.velocity.y = 0;
    }
  }

  /**
   * Collision check against solid unmined tiles using AABB bounds.
   */
  public checkTileCollision(x: number, y: number, grid: ServerMiningGrid): boolean {
    const minTileX = Math.floor(x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(x + this.halfWidth - 0.001);
    const minTileY = Math.floor(y - this.halfHeight + 0.001);
    const maxTileY = Math.floor(y + this.halfHeight - 0.001);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        // Left & Right world boundaries
        if (tx < 0 || tx >= MINING_CONFIG.GRID_WIDTH) return true;
        // Bottom bedrock boundary
        if (ty >= MINING_CONFIG.GRID_HEIGHT) return true;
        // Above ground (ty < 0) is open sky (no collision)
        if (ty < 0) continue;

        const tile = grid[ty][tx];
        if (
          tile &&
          tile.type !== MiningTileType.EMPTY &&
          tile.type !== MiningTileType.ENTRANCE &&
          tile.type !== MiningTileType.LADDER
        ) {
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
