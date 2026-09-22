import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import type { Vector2D, MiningRigidWorld, DynamiteBodyOptions, ItemPhysicsConfig } from '@mine-me/shared';
import * as planck from 'planck';

export class MiningDynamiteEntity extends MiningPhysicsBody {
  public readonly id: string;
  public readonly physicsConfig?: ItemPhysicsConfig;
  public fuseRemainingSeconds: number;
  public hasExploded: boolean = false;
  public angle: number = 0;
  public angularVelocity: number = 0;
  public rigidBody: planck.Body | null = null;
  private rigidWorld: MiningRigidWorld | null = null;

  public override get position(): Vector2D {
    return this._position;
  }
  public override set position(pos: Vector2D) {
    this._position = { ...pos };
    if (this.rigidBody) {
      this.rigidBody.setPosition(planck.Vec2(pos.x, pos.y));
    }
  }

  public override get velocity(): Vector2D {
    return this._velocity;
  }
  public override set velocity(vel: Vector2D) {
    this._velocity = { ...vel };
    if (this.rigidBody) {
      this.rigidBody.setLinearVelocity(planck.Vec2(vel.x, vel.y));
    }
  }

  public override get hasGravity(): boolean {
    return this._hasGravity;
  }
  public override set hasGravity(val: boolean) {
    this._hasGravity = val;
    if (this.rigidBody) {
      this.rigidBody.setGravityScale(val ? (this.gravityScale ?? 1.0) : 0);
    }
  }

  constructor(
    id: string,
    initialPosition: Vector2D,
    initialVelocity: Vector2D,
    fuseSeconds: number = 4.0,
    rigidWorld?: MiningRigidWorld,
    options?: DynamiteBodyOptions
  ) {
    super({
      position: { ...initialPosition },
      radius: 0.25,
      hasGravity: true,
      gravityScale: 1.0,
      mass: 1.0,
    });

    this.id = id;
    this.physicsConfig = options?.physicsConfig;
    this._position = { ...initialPosition };
    this._velocity = { ...initialVelocity };
    this._hasGravity = true;
    this.fuseRemainingSeconds = fuseSeconds;
    this.rigidWorld = rigidWorld ?? null;

    if (rigidWorld) {
      this.rigidBody = rigidWorld.createDynamiteBody(
        id,
        initialPosition,
        initialVelocity,
        options
      );
      this.angularVelocity = this.rigidBody.getAngularVelocity();
    }
  }

  public override update(dt: number, grid?: MiningCollisionGrid): void {
    if (this.hasExploded) return;

    this.fuseRemainingSeconds = Math.max(0, this.fuseRemainingSeconds - dt);
    if (this.fuseRemainingSeconds <= 0) {
      this.hasExploded = true;
      this.cleanup();
      return;
    }

    if (this.rigidBody) {
      const pos = this.rigidBody.getPosition();
      const vel = this.rigidBody.getLinearVelocity();
      this.position.x = pos.x;
      this.position.y = pos.y;
      this.velocity.x = vel.x;
      this.velocity.y = vel.y;
      this.angle = this.rigidBody.getAngle();
      this.angularVelocity = this.rigidBody.getAngularVelocity();
    } else if (grid) {
      super.update(dt, grid);
      this.angle += (this.velocity.x * 2.0) * dt;
    }
  }

  public cleanup(): void {
    if (this.rigidBody && this.rigidWorld) {
      this.rigidWorld.destroyBody(this.rigidBody);
      this.rigidBody = null;
    }
  }

  protected override onGroundHit(): void {
    this.velocity.x *= 0.5;
    if (Math.abs(this.velocity.x) < 0.05) {
      this.velocity.x = 0;
    }
  }

  protected override onCollideX(): void {
    this.velocity.x = 0;
  }
}
