import { MINING_CONFIG, type MiningInputState, type Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';
import { MiningPhysicsBody } from './MiningPhysicsBody';

export class MiningPlayerBody extends MiningPhysicsBody {
  public facing: Vector2D = { x: 0, y: 1 };
  public collisionX = false;
  public collisionY = false;

  constructor(position: Vector2D) {
    super({
      position,
      radius: MINING_CONFIG.PLAYER_RADIUS / MINING_CONFIG.TILE_SIZE,
      hasGravity: true,
      gravityScale: 1.0,
      mass: 1.0,
    });
  }

  /**
   * Process inputs to set horizontal velocity and facing direction.
   */
  public processInputs(inputs: MiningInputState): void {
    let dx = 0;
    if (inputs.left) dx -= 1;
    if (inputs.right) dx += 1;

    // Up/Down facing direction selection
    let dy = 0;
    if (inputs.up) dy -= 1;
    if (inputs.down) dy += 1;

    // Update facing direction based on active inputs
    if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = { x: Math.sign(dx), y: 0 };
      } else {
        this.facing = { x: 0, y: Math.sign(dy) };
      }
    }

    // Set horizontal velocity directly based on move speed
    this.velocity.x = dx * MINING_CONFIG.MOVE_SPEED;
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
