import { BLOCK_SCALE, rockMass } from '@mine-me/shared';
import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import type { Vector2D, MiningRigidWorld, RockBodyOptions } from '@mine-me/shared';
import type * as planck from 'planck';

export class MiningRockEntity extends MiningPhysicsBody {
  public readonly id: string;
  /** How heavy the rock is, in 1 x 1 rocks (see rockMass). It scales the damage it does and how far it shoves. */
  public get rockMass(): number {
    return rockMass({ width: this.cellsWide, height: this.cellsHigh });
  }
  public readonly tileX: number;
  /** Cells wide and high; a 1 x 1 rock is the original single-cell rock. */
  public readonly cellsWide: number;
  public readonly cellsHigh: number;
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
    const cellsWide = options?.width ?? 1;
    const cellsHigh = options?.height ?? 1;
    const isBig = cellsWide > 1 || cellsHigh > 1;
    // Center the rock on its footprint (tileX, tileY is the top-left cell)
    const centre = { x: tileX + cellsWide / 2, y: tileY + cellsHigh / 2 };
    super({
      position: centre,
      // A single cell stays inside the 1-cell shaft; a bigger rock is as wide and high as its footprint
      ...(isBig ? { width: cellsWide - 0.04, height: cellsHigh - 0.04 } : { radius: 0.4 }),
      hasGravity: true,
      gravityScale: options?.gravityScale ?? 1.2,
      mass: isBig ? rockMass({ width: cellsWide, height: cellsHigh }) : 5.0,
    });
    this.id = id;
    this.tileX = tileX;
    this.cellsWide = cellsWide;
    this.cellsHigh = cellsHigh;
    this.previousPosition = { ...centre };
    this.rigidWorld = rigidWorld ?? null;

    if (rigidWorld) {
      this.rigidBody = rigidWorld.createRockBody(id, centre, options);
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
          this.settle(check.floorTileY !== undefined ? check.floorTileY - this.cellsHigh : undefined);
        }
      }
    } else if (grid) {
      // Lock X to the footprint's center in fallback mode
      this.position.x = this.tileX + this.cellsWide / 2;
      this.velocity.x = 0;

      super.update(dt, grid);
      // The rock may settle part-way through a split step; the rest of that step must not move it off the tile centre
      if (this.hasSettled && this.settledTile) {
        this.position.x = this.settledTile.x + this.cellsWide / 2;
        this.position.y = this.settledTile.y + this.cellsHigh / 2;
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
      this.totalFallenDistance += Math.max(0, this.position.y - prevY);
    }
  }

  /** Comes to rest with its top-left cell at (round(x), `targetY`), snapped to the grid. */
  public settle(targetY?: number): void {
    this.hasSettled = true;
    const restY = targetY ?? Math.round(this.position.y - this.cellsHigh / 2);
    const restX = Math.round(this.position.x - this.cellsWide / 2);

    this.position.x = restX + this.cellsWide / 2;
    this.position.y = restY + this.cellsHigh / 2;
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
    this.settle();
  }
}
