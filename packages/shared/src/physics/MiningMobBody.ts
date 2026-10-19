import { MINING_CONFIG, isTileClimbable, type MiningPosition, type Vector2D } from '../types/mining';
import { getGridDimensions } from './gridDimensions';
import { MiningPhysicsBody, type MiningCollisionGrid, type PhysicsBodyOptions } from './MiningPhysicsBody';

export interface MiningMobBodyOptions extends Partial<PhysicsBodyOptions> {
  position: Vector2D;
  moveSpeed?: number;
  jumpForce?: number;
  climbSpeed?: number;
}

/**
 * Physics body representing an NPC / mob entity within the mining cavern.
 * Handles continuous movement integration, AABB collisions against the static mining grid,
 * gravity, jumping, ladder climbing, and mining orientation.
 */
export class MiningMobBody extends MiningPhysicsBody {
  public moveSpeed: number;
  public jumpForce: number;
  public climbSpeed: number;
  public isFacingLeft: boolean = false;
  public isOnLadder: boolean = false;
  public isMining: boolean = false;
  public miningTarget: MiningPosition | null = null;
  public miningProgress: number = 0;
  public collisionX: boolean = false;

  constructor(options: MiningMobBodyOptions) {
    const colliderWidth = options.width ?? MINING_CONFIG.PLAYER_COLLIDER_WIDTH_TILES;
    const colliderHeight = options.height ?? MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES;

    super({
      position: options.position,
      width: colliderWidth,
      height: colliderHeight,
      hasGravity: options.hasGravity ?? true,
      gravityScale: options.gravityScale ?? 1.0,
      mass: options.mass ?? 1.0,
    });

    this.moveSpeed = options.moveSpeed ?? MINING_CONFIG.MOB_DEFAULT_MOVE_SPEED;
    this.jumpForce = options.jumpForce ?? MINING_CONFIG.MOB_DEFAULT_JUMP_FORCE;
    this.climbSpeed = options.climbSpeed ?? MINING_CONFIG.MOB_DEFAULT_CLIMB_SPEED;
  }

  /**
   * Check if mob's collider overlaps any climbable tile (LADDER or ENTRANCE).
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
   * Apply directional movement and jumping intentions to mob physics.
   */
  public processMovement(
    moveX: number,
    jump: boolean,
    climbUp: boolean,
    climbDown: boolean,
    grid?: MiningCollisionGrid
  ): void {
    this.collisionX = false;

    // Determine facing direction
    if (moveX < 0) {
      this.isFacingLeft = true;
    } else if (moveX > 0) {
      this.isFacingLeft = false;
    }

    // Wading through fluid slows the mob like the player (jumps lose less: height goes with speed squared)
    const fluid = this.updateFluidContact();
    const jumpFactor = Math.sqrt(fluid);

    // Set horizontal velocity
    // moveX is -1..1: a fraction walks slower, which lets a mob settle exactly on the spot it is aiming for
    this.velocity.x = Math.max(-1, Math.min(1, moveX)) * this.moveSpeed * fluid;

    // Check ladders
    if (grid) {
      this.isOnLadder = this.checkIsOnLadder(grid);
    }

    if (this.isOnLadder) {
      if (jump) {
        // Leap off ladder
        this.velocity.y = -this.jumpForce * jumpFactor;
        this.isGrounded = false;
        this.hasGravity = true;
      } else if (climbUp) {
        this.velocity.y = -this.climbSpeed * fluid;
        this.isGrounded = false;
        this.hasGravity = false;
      } else if (climbDown) {
        this.velocity.y = this.climbSpeed * fluid;
        this.hasGravity = false;
      } else {
        // Hold grip
        this.velocity.y = 0;
        this.hasGravity = false;
      }
    } else {
      this.hasGravity = true;

      // Jump if grounded
      if (jump && this.isGrounded) {
        this.velocity.y = -this.jumpForce * jumpFactor;
        this.isGrounded = false;
      }
    }
  }

  /**
   * Begin mining a target block.
   */
  public startMining(target: MiningPosition): void {
    this.isMining = true;
    this.miningTarget = { ...target };
    this.velocity.x = 0;
    if (target.x < this.position.x) {
      this.isFacingLeft = true;
    } else if (target.x > this.position.x) {
      this.isFacingLeft = false;
    }
  }

  /**
   * Stop mining.
   */
  public stopMining(): void {
    this.isMining = false;
    this.miningTarget = null;
    this.miningProgress = 0;
  }

  protected override onCollideX(): void {
    this.collisionX = true;
  }
}
