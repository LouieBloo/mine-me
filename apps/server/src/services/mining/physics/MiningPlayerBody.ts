import { MINING_CONFIG, MiningTileType, type MiningInputState, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';
import { MiningPhysicsBody } from './MiningPhysicsBody';

export class MiningPlayerBody extends MiningPhysicsBody {
  public facing: Vector2D = { x: 0, y: 1 };
  public collisionX = false;
  public collisionY = false;
  public isOnLadder = false;

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
  public checkIsOnLadder(grid: ServerMiningGrid): boolean {
    const minTileX = Math.floor(this.position.x - this.halfWidth + 0.001);
    const maxTileX = Math.floor(this.position.x + this.halfWidth - 0.001);
    const minTileY = Math.floor(this.position.y - this.halfHeight + 0.001);
    const maxTileY = Math.floor(this.position.y + this.halfHeight - 0.001);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        if (ty < 0 || ty >= MINING_CONFIG.GRID_HEIGHT || tx < 0 || tx >= MINING_CONFIG.GRID_WIDTH) {
          continue;
        }
        const tile = grid[ty][tx];
        if (tile && (tile.type === MiningTileType.LADDER)) {
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
   * Process inputs to set velocity, facing direction, climbing, and jumping.
   */
  public processInputs(inputs: MiningInputState, grid?: ServerMiningGrid): void {
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

    // Set horizontal velocity directly based on move speed
    this.velocity.x = dx * MINING_CONFIG.MOVE_SPEED;

    // Ladder Climbing & Physics Handling
    if (grid) {
      this.isOnLadder = this.checkIsOnLadder(grid);
    }

    if (this.isOnLadder) {
      // If pressing jump while on a ladder, player leaps off the ladder
      if (inputs.jump) {
        this.velocity.y = -MINING_CONFIG.JUMP_FORCE;
        this.isGrounded = false;
        this.hasGravity = true;
      } else if (inputs.up) {
        // Climb Up
        this.velocity.y = -MINING_CONFIG.CLIMB_SPEED;
        this.isGrounded = false;
        this.hasGravity = false;
      } else if (inputs.down) {
        // Climb Down
        this.velocity.y = MINING_CONFIG.CLIMB_SPEED;
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
        this.velocity.y = -MINING_CONFIG.JUMP_FORCE;
        this.isGrounded = false;
      }
    }
  }

  public override update(dt: number, grid: ServerMiningGrid): void {
    this.collisionX = false;
    this.collisionY = false;
    super.update(dt, grid);
  }

  protected override onCollideX(): void {
    this.collisionX = true;
  }

  protected override onGroundHit(): void {
    this.collisionY = true;
  }

  protected override onCeilingHit(): void {
    this.collisionY = true;
  }
}
