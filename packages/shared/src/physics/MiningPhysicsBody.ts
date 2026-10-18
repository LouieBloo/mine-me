import { MINING_CONFIG, isTileSolid, type Vector2D, type MiningTileType } from '../types/mining';
import { getGridDimensions } from './gridDimensions';
import { movementFactorAt, type FluidEnvironment } from '../gameLogic/fluid/fluidSubmersion';
import { sampleGasContact, type GasContact, type GasEnvironment } from '../gameLogic/gas/gasEnvironment';

export interface MiningCollisionGrid {
  [y: number]: { [x: number]: { type: MiningTileType } };
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
  protected _position: Vector2D;
  protected _velocity: Vector2D = { x: 0, y: 0 };
  protected _hasGravity: boolean;

  public get position(): Vector2D {
    return this._position;
  }
  public set position(pos: Vector2D) {
    this._position = pos;
  }

  public get velocity(): Vector2D {
    return this._velocity;
  }
  public set velocity(vel: Vector2D) {
    this._velocity = vel;
  }

  public get hasGravity(): boolean {
    return this._hasGravity;
  }
  public set hasGravity(val: boolean) {
    this._hasGravity = val;
  }

  public halfWidth: number;
  public halfHeight: number;
  public radius: number;
  public gravityScale: number;
  public isGrounded: boolean = false;
  public mass: number;
  /** The fluid around the body, if the room has any. Set by whoever steps the body (server or client prediction). */
  public fluidEnvironment: FluidEnvironment | null = null;
  /** Speed multiplier from wading through fluid, 1 when dry (see `updateFluidContact`). */
  public movementFactor = 1;
  /** How far (tiles) the body stepped up onto a ledge during the last `update` (0 when it did not). Drawing eases this out. */
  public stepUpLift = 0;
  /** The gas around the body, if the room has any. Set by whoever steps the body (server or client prediction). */
  public gasEnvironment: GasEnvironment | null = null;
  /** The gas the body is in right now (null in clear air). Nothing reads it yet: gases do not affect bodies for now. */
  public gasContact: GasContact | null = null;

  constructor(options: PhysicsBodyOptions) {
    this._position = { ...options.position };
    if (options.width !== undefined && options.height !== undefined) {
      this.halfWidth = options.width / 2;
      this.halfHeight = options.height / 2;
    } else if (options.radius !== undefined) {
      this.halfWidth = options.radius;
      this.halfHeight = options.radius;
    } else {
      this.halfWidth = MINING_CONFIG.PLAYER_COLLIDER_WIDTH_TILES / 2;
      this.halfHeight = MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2;
    }
    this.radius = Math.max(this.halfWidth, this.halfHeight);
    this._hasGravity = options.hasGravity ?? true;
    this.gravityScale = options.gravityScale ?? 1.0;
    this.mass = options.mass ?? 1.0;
  }

  /**
   * Applies an acceleration or velocity change to the body.
   */
  /** Works out how much the fluid around the body slows it right now. Call before reading `movementFactor`. */
  public updateFluidContact(): number {
    this.movementFactor = movementFactorAt(this.fluidEnvironment, this.position.x, this.position.y, this.halfWidth, this.halfHeight);
    return this.movementFactor;
  }

  /** Works out which gas the body is in right now (see `gasContact`). */
  public updateGasContact(): GasContact | null {
    this.gasContact = this.gasEnvironment
      ? sampleGasContact(this.gasEnvironment.sampler, this.position.x, this.position.y, this.halfWidth, this.halfHeight)
      : null;
    return this.gasContact;
  }

  public applyImpulse(impulse: Vector2D): void {
    this.velocity.x += impulse.x / this.mass;
    this.velocity.y += impulse.y / this.mass;
  }

  /**
   * Checks if there is a solid tile immediately beneath the body's feet.
   */
  public checkGround(grid: MiningCollisionGrid): { isGrounded: boolean; floorTileY?: number } {
    const { width, height } = getGridDimensions(grid);
    const feetY = this.position.y + this.halfHeight;
    const floorTileY = Math.floor(feetY + 0.05);

    // Bedrock floor at bottom of map
    if (floorTileY >= height) {
      return { isGrounded: true, floorTileY: height };
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
      if (tx < 0 || tx >= width) continue;
      const tile = row[tx];
      if (tile && isTileSolid(tile.type)) {
        return { isGrounded: true, floorTileY };
      }
    }

    return { isGrounded: false };
  }

  /**
   * Physics simulation step for dt seconds.
   *
   * Speed is capped at MAX_ENTITY_SPEED and the step is split so that no sub-step moves the body
   * further than MAX_STEP_DISPLACEMENT, which keeps a fast body (knockback, blast) from tunnelling
   * through a thin wall. Slow bodies run a single step, exactly as before.
   */
  public update(dt: number, grid: MiningCollisionGrid): void {
    this.stepUpLift = 0;
    // Fresh every step, so a body that moves out of (or into) fluid is never held to the last reading
    this.updateFluidContact();
    this.updateGasContact();
    const cap = MINING_CONFIG.MAX_ENTITY_SPEED;
    this.velocity.x = Math.max(-cap, Math.min(cap, this.velocity.x));
    this.velocity.y = Math.max(-cap, Math.min(cap, this.velocity.y));

    const maxDisplacement = Math.max(Math.abs(this.velocity.x), Math.abs(this.velocity.y)) * dt;
    const steps = Math.max(1, Math.ceil(maxDisplacement / MINING_CONFIG.MAX_STEP_DISPLACEMENT));
    const subDt = dt / steps;
    for (let i = 0; i < steps; i++) this.step(subDt, grid);
  }

  /** One collision-resolved integration step (axis-separated: vertical, then horizontal). */
  private step(dt: number, grid: MiningCollisionGrid): void {
    const { width, height } = getGridDimensions(grid);
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
      // Thick fluid slows a fall, but never stops it: a body always sinks, just slowly
      const terminal = MINING_CONFIG.TERMINAL_FALL_SPEED * Math.max(MINING_CONFIG.FLUID_MIN_FALL_FACTOR, this.movementFactor);
      if (this.velocity.y > terminal) {
        this.velocity.y = terminal;
      }
    }

    // 3. Perform separated vertical collision check if airborne or moving vertically
    if (!this.isGrounded || this.velocity.y !== 0) {
      let targetY = this.position.y + this.velocity.y * dt;
      targetY = Math.max(-50, Math.min(height - this.halfHeight, targetY));

      if (!this.checkTileCollision(this.position.x, targetY, grid)) {
        this.position.y = targetY;
        this.isGrounded = false;
      } else {
        if (this.velocity.y > 0) {
          // Hitting the floor -> ground the body and snap cleanly to the top surface of floor tile
          this.isGrounded = true;
          const impactSpeed = this.velocity.y;
          const floorTileY = Math.floor(targetY + this.halfHeight);
          this.position.y = floorTileY - this.halfHeight;
          this.velocity.y = 0;
          this.onGroundHit(impactSpeed);
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
    targetX = Math.max(this.halfWidth, Math.min(width - this.halfWidth, targetX));

    if (!this.checkTileCollision(targetX, this.position.y, grid)) {
      this.position.x = targetX;
    } else if (this.tryStepUp(targetX, grid)) {
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
   * Walks a grounded body up onto a ledge that blocks it, if the ledge is no higher than MAX_STEP_UP_TILES and there is
   * room for the whole body on top: the body moves up by the ledge height and on to `targetX` in the same step instead
   * of stopping. Never in the air, and never over a wall taller than the step, so a jump is still needed for those.
   */
  private tryStepUp(targetX: number, grid: MiningCollisionGrid): boolean {
    const lift = MINING_CONFIG.MAX_STEP_UP_TILES;
    if (!(lift > 0) || !this.isGrounded || this.velocity.y < 0) return false;
    const y = this.position.y - lift;
    if (this.checkTileCollision(targetX, y, grid)) return false;
    // It must be a ledge to stand on: solid ground right under the lifted feet
    if (!this.hasSolidUnder(targetX, y, grid)) return false;
    this.position.y = y;
    this.stepUpLift += lift;
    return true;
  }

  /** Whether any solid tile lies directly under the body's feet if it stood at (x, y). */
  private hasSolidUnder(x: number, y: number, grid: MiningCollisionGrid): boolean {
    const { width, height } = getGridDimensions(grid);
    const feet = y + this.halfHeight;
    const row = Math.floor(feet + 0.05);
    if (row >= height) return true;
    if (row < 0) return false;
    const minTileX = Math.floor(x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(x + this.halfWidth - 0.001);
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (tx < 0 || tx >= width) continue;
      const tile = grid[row]?.[tx];
      if (tile && isTileSolid(tile.type)) return true;
    }
    return false;
  }

  /**
   * Collision check against solid unmined tiles using AABB bounds.
   */
  public checkTileCollision(x: number, y: number, grid: MiningCollisionGrid): boolean {
    const { width, height } = getGridDimensions(grid);
    const minTileX = Math.floor(x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(x + this.halfWidth - 0.001);
    const minTileY = Math.floor(y - this.halfHeight + 0.001);
    const maxTileY = Math.floor(y + this.halfHeight - 0.001);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        // Left & Right world boundaries
        if (tx < 0 || tx >= width) return true;
        // Bottom bedrock boundary
        if (ty >= height) return true;
        // Above ground (ty < 0) is open sky (no collision)
        if (ty < 0) continue;

        const row = grid[ty];
        const tile = row ? row[tx] : undefined;
        if (tile && isTileSolid(tile.type)) {
          return true;
        }
      }
    }
    return false;
  }

  protected onCollideX(): void {}
  /** Called when the body lands; `impactSpeed` is the downward speed (tiles/s) it hit the floor at. */
  protected onGroundHit(_impactSpeed: number): void {}
  protected onCeilingHit(): void {}
}
