import { MiningPhysicsBody } from './MiningPhysicsBody';
import type { Vector2D } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

export class MiningRockEntity extends MiningPhysicsBody {
  public readonly id: string;
  public readonly tileX: number;
  public hasSettled: boolean = false;
  public settledTile: { x: number; y: number } | null = null;
  public totalFallenDistance: number = 0;

  constructor(id: string, tileX: number, tileY: number) {
    super({
      // Center the rock in its tile (0.5 offset on both axes)
      position: { x: tileX + 0.5, y: tileY + 0.5 },
      radius: 0.4, // Keep within the 1-tile shaft
      hasGravity: true,
      gravityScale: 1.2, // Rocks accelerate faster
      mass: 5.0,
    });
    this.id = id;
    this.tileX = tileX;
  }

  public override update(dt: number, grid: ServerMiningGrid): void {
    if (this.hasSettled) return;

    const prevY = this.position.y;
    // Lock X to exact tile center so rocks fall strictly down vertical shafts
    this.position.x = this.tileX + 0.5;
    this.velocity.x = 0;

    super.update(dt, grid);
    this.totalFallenDistance += Math.max(0, this.position.y - prevY);
  }

  protected override onGroundHit(): void {
    // When the falling rock lands on solid ground, settle it.
    this.hasSettled = true;

    // position.y is the center of the rock at the last non-colliding position.
    // floor(position.y) gives the tile index the rock's center is in.
    const restY = Math.floor(this.position.y);

    // Snap position to exact tile center for seamless visual handoff
    this.position.y = restY + 0.5;

    this.settledTile = {
      x: this.tileX,
      y: restY,
    };
  }
}
