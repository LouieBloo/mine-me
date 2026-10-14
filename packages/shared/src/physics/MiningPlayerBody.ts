import { MINING_CONFIG, isTileClimbable, type MiningInputState, type Vector2D } from '../types/mining';
import { getGridDimensions } from './gridDimensions';
import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';

export class MiningPlayerBody extends MiningPhysicsBody {
  public facing: Vector2D = { x: 0, y: 1 };
  public collisionX = false;
  public collisionY = false;
  public isOnLadder = false;
  /** Seconds left in which movement input is ignored after being knocked back. */
  public knockbackRemaining = 0;
  /** Fastest downward speed (tiles/s) at which the body hit the floor during the last `update` (0 if it did not land). */
  public lastImpactSpeed = 0;

  constructor(position: Vector2D) {
    super({
      position,
      width: MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE,
      height: MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE,
      hasGravity: true,
      gravityScale: 1.0,
      mass: 1.0,
    });
  }

  /**
   * Check if player's collider overlaps any LADDER (or ENTRANCE) tile within ladder grab width.
   */
  public checkIsOnLadder(grid: MiningCollisionGrid): boolean {
    const { width, height } = getGridDimensions(grid);
    const minTileX = Math.floor(this.position.x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(this.position.x + this.halfWidth - 0.001);
    const minTileY = Math.floor(this.position.y - this.halfHeight + 0.001);
    const maxTileY = Math.floor(this.position.y + this.halfHeight - 0.001);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        if (ty < 0 || ty >= height || tx < 0 || tx >= width) {
          continue;
        }
        const row = grid[ty];
        const tile = row ? row[tx] : undefined;
        if (tile && isTileClimbable(tile.type)) {
          // Check horizontal distance to the ladder center
          const ladderCenterX = tx + 0.5;
          const distToCenter = Math.abs(this.position.x - ladderCenterX);
          if (distToCenter <= MINING_CONFIG.LADDER_GRAB_WIDTH) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Launches the body (e.g. when hit). Input cannot steer it for `seconds`, and a ladder is let go.
   */
  public applyKnockback(vx: number, vy: number, seconds: number): void {
    this.velocity.x = vx;
    this.velocity.y = vy;
    this.isGrounded = false;
    this.isOnLadder = false;
    this.hasGravity = true;
    this.knockbackRemaining = Math.max(0, seconds);
  }

  /**
   * Process inputs to set velocity, facing direction, climbing, and jumping.
   */
  public processInputs(inputs: MiningInputState, grid?: MiningCollisionGrid): void {
    let dx = 0;
    if (inputs.left) dx -= 1;
    if (inputs.right) dx += 1;

    // Up/Down facing direction selection
    let dy = 0;
    if (inputs.up) dy -= 1;
    if (inputs.down) dy += 1;

    // Update facing direction based on active inputs (supports diagonals: NW, NE, SW, SE)
    if (dx !== 0 || dy !== 0) {
      this.facing = { x: Math.sign(dx), y: Math.sign(dy) };
    }

    // Wading through fluid slows walking, climbing and jumping (a jump loses less speed than a walk,
    // so a pool can be climbed out of: height goes with the square of speed)
    const fluid = this.updateFluidContact();
    const jumpFactor = Math.sqrt(fluid);

    // While knocked back the player is carried by the impulse, not by input or ladders
    if (this.knockbackRemaining > 0) {
      this.hasGravity = true;
      return;
    }

    // Set horizontal velocity directly based on move speed
    this.velocity.x = dx * MINING_CONFIG.MOVE_SPEED * fluid;

    // Ladder Climbing & Physics Handling
    if (grid) {
      this.isOnLadder = this.checkIsOnLadder(grid);
    }

    if (this.isOnLadder) {
      // If pressing jump while on a ladder, player leaps off the ladder
      if (inputs.jump) {
        this.velocity.y = -MINING_CONFIG.JUMP_FORCE * jumpFactor;
        this.isGrounded = false;
        this.hasGravity = true;
      } else if (inputs.up) {
        // Climb Up
        this.velocity.y = -MINING_CONFIG.CLIMB_SPEED * fluid;
        this.isGrounded = false;
        this.hasGravity = false;
      } else if (inputs.down) {
        // Climb Down
        this.velocity.y = MINING_CONFIG.CLIMB_SPEED * fluid;
        this.hasGravity = false;
      } else {
        // Stationary on ladder (hold grip without slipping)
        this.velocity.y = 0;
        this.hasGravity = false;
      }
    } else {
      // Normal physics outside of ladder
      this.hasGravity = true;

      // Handle Jump if grounded and spacebar/jump key is pressed
      if (inputs.jump && this.isGrounded) {
        this.velocity.y = -MINING_CONFIG.JUMP_FORCE * jumpFactor;
        this.isGrounded = false;
      }
    }
  }

  public override update(dt: number, grid: MiningCollisionGrid): void {
    this.collisionX = false;
    this.collisionY = false;
    this.lastImpactSpeed = 0;
    if (this.knockbackRemaining > 0) {
      this.knockbackRemaining = Math.max(0, this.knockbackRemaining - dt);
    }
    super.update(dt, grid);
  }

  protected override onCollideX(): void {
    this.collisionX = true;
  }

  protected override onGroundHit(impactSpeed: number): void {
    this.collisionY = true;
    this.lastImpactSpeed = Math.max(this.lastImpactSpeed, impactSpeed);
  }

  protected override onCeilingHit(): void {
    this.collisionY = true;
  }
}
