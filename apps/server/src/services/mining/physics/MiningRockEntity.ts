import { BLOCK_SCALE } from '@mine-me/shared';
import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import type { Vector2D, MiningRigidWorld, RockBodyOptions } from '@mine-me/shared';
import type * as planck from 'planck';

export class MiningRockEntity extends MiningPhysicsBody {
  public readonly id: string;
  public readonly tileX: number;
  public hasSettled: boolean = false;
  public settledTile: { x: number; y: number } | null = null;
  public totalFallenDistance: number = 0;
  /** Players this rock has already hit, so one fall hurts each player at most once. */
  public readonly hitPlayerIds: Set<string> = new Set();
  /** Where the rock was, and how fast it was falling, before the latest `update` (for swept hit tests). */
  public previousPosition: Vector2D;
  public previousVelocityY = 0;
  public angle: number = 0;
  public angularVelocity: number = 0;
  public rigidBody: planck.Body | null = null;
  private rigidWorld: MiningRigidWorld | null = null;

  constructor(
    id: string,
    tileX: number,
    tileY: number,
    rigidWorld?: MiningRigidWorld,
    options?: RockBodyOptions
  ) {
    super({
      // Center the rock in its tile (0.5 offset on both axes)
      position: { x: tileX + 0.5, y: tileY + 0.5 },
      radius: 0.4, // Keep within the 1-tile shaft
      hasGravity: true,
      gravityScale: options?.gravityScale ?? 1.2,
      mass: 5.0,
    });
    this.id = id;
    this.tileX = tileX;
    this.previousPosition = { x: tileX + 0.5, y: tileY + 0.5 };
    this.rigidWorld = rigidWorld ?? null;

    if (rigidWorld) {
      this.rigidBody = rigidWorld.createRockBody(
        id,
        { x: tileX + 0.5, y: tileY + 0.5 },
        options
      );
    }
  }

  public override update(dt: number, grid?: MiningCollisionGrid): void {
    if (this.hasSettled) return;

    const prevY = this.position.y;
    this.previousPosition = { x: this.position.x, y: this.position.y };
    this.previousVelocityY = this.velocity.y;

    if (this.rigidBody) {
      const pos = this.rigidBody.getPosition();
      const vel = this.rigidBody.getLinearVelocity();
      this.position.x = pos.x;
      this.position.y = pos.y;
      this.velocity.x = vel.x;
      this.velocity.y = vel.y;
      this.angle = this.rigidBody.getAngle();
      this.angularVelocity = this.rigidBody.getAngularVelocity();

      this.totalFallenDistance += Math.max(0, this.position.y - prevY);

      if (grid && this.totalFallenDistance > 0.3) {
        const check = this.checkGround(grid);
        if (check.isGrounded && Math.abs(vel.y) < 1.0 * BLOCK_SCALE) {
          this.settle(check.floorTileY !== undefined ? check.floorTileY - 1 : Math.floor(this.position.y));
        }
      }
    } else if (grid) {
      // Lock X to exact tile center in fallback mode
      this.position.x = this.tileX + 0.5;
      this.velocity.x = 0;

      super.update(dt, grid);
      // The rock may settle part-way through a split step; the rest of that step must not move it off the tile centre
      if (this.hasSettled && this.settledTile) {
        this.position.x = this.settledTile.x + 0.5;
        this.position.y = this.settledTile.y + 0.5;
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
      this.totalFallenDistance += Math.max(0, this.position.y - prevY);
    }
  }

  public settle(targetY?: number): void {
    this.hasSettled = true;
    const restY = targetY ?? Math.floor(this.position.y);
    const restX = Math.round(this.position.x - 0.5);

    this.position.x = restX + 0.5;
    this.position.y = restY + 0.5;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.settledTile = {
      x: restX,
      y: restY,
    };
    this.cleanup();
  }

  public cleanup(): void {
    if (this.rigidBody && this.rigidWorld) {
      this.rigidWorld.destroyBody(this.rigidBody);
      this.rigidBody = null;
    }
  }

  protected override onGroundHit(): void {
    this.settle(Math.floor(this.position.y));
  }
}
