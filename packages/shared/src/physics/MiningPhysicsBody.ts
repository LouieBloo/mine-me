import { MINING_CONFIG, isTileSolid, type Vector2D, type MiningTileType } from '../types/mining';

export interface MiningCollisionGrid {
  [y: number]: { [x: number]: { type: MiningTileType | number } };
}

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
   * Checks if there is a solid tile immediately beneath the body's feet.
   */
  public checkGround(grid: MiningCollisionGrid): { isGrounded: boolean; floorTileY?: number } {
    const feetY = this.position.y + this.halfHeight;
    const floorTileY = Math.floor(feetY + 0.05);

    // Bedrock floor at bottom of map
    if (floorTileY >= MINING_CONFIG.GRID_HEIGHT) {
      return { isGrounded: true, floorTileY: MINING_CONFIG.GRID_HEIGHT };
    }
    if (floorTileY < 0) {
      return { isGrounded: false };
    }

    const minTileX = Math.floor(this.position.x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(this.position.x + this.halfWidth - 0.001);

    const row = grid[floorTileY];
    if (!row) {
      return { isGrounded: false };
    }

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (tx < 0 || tx >= MINING_CONFIG.GRID_WIDTH) continue;
      const tile = row[tx];
      if (tile && isTileSolid(tile.type as any)) {
        return { isGrounded: true, floorTileY };
      }
    }

    return { isGrounded: false };
  }

  /**
   * Physics simulation step for dt seconds.
   */
  public update(dt: number, grid: MiningCollisionGrid): void {
    // 1. Ground stability check:
    // If the body is marked as grounded and not jumping upward, verify whether solid ground remains underneath.
    if (this.isGrounded && this.velocity.y >= 0) {
      const groundCheck = this.checkGround(grid);
      if (groundCheck.isGrounded && groundCheck.floorTileY !== undefined) {
        this.position.y = groundCheck.floorTileY - this.halfHeight;
        this.velocity.y = 0;
      } else {
        this.isGrounded = false;
      }
    }

    // 2. Apply gravity if not grounded
    if (this.hasGravity && !this.isGrounded) {
      this.velocity.y += MINING_CONFIG.GRAVITY * this.gravityScale * dt;
      if (this.velocity.y > MINING_CONFIG.TERMINAL_FALL_SPEED) {
        this.velocity.y = MINING_CONFIG.TERMINAL_FALL_SPEED;
      }
    }

    // 3. Perform separated vertical collision check if airborne or moving vertically
    if (!this.isGrounded || this.velocity.y !== 0) {
      let targetY = this.position.y + this.velocity.y * dt;
      targetY = Math.max(-50, Math.min(MINING_CONFIG.GRID_HEIGHT - this.halfHeight, targetY));

      if (!this.checkTileCollision(this.position.x, targetY, grid)) {
        this.position.y = targetY;
        this.isGrounded = false;
      } else {
        if (this.velocity.y > 0) {
          // Hitting the floor -> ground the body and snap cleanly to the top surface of floor tile
          this.isGrounded = true;
          const floorTileY = Math.floor(targetY + this.halfHeight);
          this.position.y = floorTileY - this.halfHeight;
          this.velocity.y = 0;
          this.onGroundHit();
        } else if (this.velocity.y < 0) {
          // Hitting the ceiling -> stop upward momentum and snap under ceiling
          const ceilingTileY = Math.floor(targetY - this.halfHeight);
          this.position.y = ceilingTileY + 1.0 + this.halfHeight;
          this.velocity.y = 0;
          this.onCeilingHit();
        }
      }
    }

    // 4. Horizontal Movement test
    let targetX = this.position.x + this.velocity.x * dt;
    targetX = Math.max(this.halfWidth, Math.min(MINING_CONFIG.GRID_WIDTH - this.halfWidth, targetX));

    if (!this.checkTileCollision(targetX, this.position.y, grid)) {
      this.position.x = targetX;
    } else {
      if (this.velocity.x > 0) {
        // Moving right into a wall -> snap flush to left surface of blocking wall tile
        const wallTileX = Math.floor(targetX + this.halfWidth - 0.001);
        this.position.x = wallTileX - this.halfWidth;
      } else if (this.velocity.x < 0) {
        // Moving left into a wall -> snap flush to right surface of blocking wall tile
        const wallTileX = Math.floor(targetX - this.halfWidth + 0.001);
        this.position.x = wallTileX + 1.0 + this.halfWidth;
      }
      this.onCollideX();
      this.velocity.x = 0;
    }

    // 5. Post-movement ground check:
    // If body moved horizontally off a ledge, unground immediately
    if (this.isGrounded && this.velocity.y >= 0) {
      const groundCheck = this.checkGround(grid);
      if (!groundCheck.isGrounded) {
        this.isGrounded = false;
      }
    }
  }

  /**
   * Collision check against solid unmined tiles using AABB bounds.
   */
  public checkTileCollision(x: number, y: number, grid: MiningCollisionGrid): boolean {
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

        const row = grid[ty];
        const tile = row ? row[tx] : undefined;
        if (tile && isTileSolid(tile.type as any)) {
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
