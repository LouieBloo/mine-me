import { MiningPhysicsBody } from './MiningPhysicsBody';
import type { Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

export class MiningDynamiteEntity extends MiningPhysicsBody {
  public readonly id: string;
  public fuseRemainingSeconds: number;
  public hasExploded: boolean = false;

  constructor(
    id: string,
    initialPosition: Vector2D,
    initialVelocity: Vector2D,
    fuseSeconds: number = 4.0
  ) {
    super({
      position: { ...initialPosition },
      radius: 0.25,
      hasGravity: true,
      gravityScale: 1.0,
      mass: 1.0,
    });

    this.id = id;
    this.velocity = { ...initialVelocity };
    this.fuseRemainingSeconds = fuseSeconds;
  }

  public override update(dt: number, grid: ServerMiningGrid): void {
    if (this.hasExploded) return;

    this.fuseRemainingSeconds = Math.max(0, this.fuseRemainingSeconds - dt);
    if (this.fuseRemainingSeconds <= 0) {
      this.hasExploded = true;
    }

    super.update(dt, grid);
  }

  protected override onGroundHit(): void {
    // Apply ground friction to slide to a halt
    this.velocity.x *= 0.5;
    if (Math.abs(this.velocity.x) < 0.05) {
      this.velocity.x = 0;
    }
  }

  protected override onCollideX(): void {
    // Dynamite hits wall, loses horizontal velocity and drops down
    this.velocity.x = 0;
  }
}
