import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import {
  type Vector2D,
  type MiningRigidWorld,
  type ProjectileBodyOptions,
  isTileSolid,
  MINING_CONFIG,
} from '@mine-me/shared';
import * as planck from 'planck';

export interface ProjectileEntityOptions extends ProjectileBodyOptions {
  damage?: number;
  weaponItemId?: string;
  maxLifetime?: number;
  spriteUrl?: string | null;
  inGameScale?: number;
}

/**
 * Server-authoritative physics-backed projectile entity (e.g. 6-shooter revolver bullet).
 * Powered by Planck.js rigid body simulation with continuous collision detection (CCD).
 */
export class MiningProjectileEntity extends MiningPhysicsBody {
  public readonly id: string;
  public readonly characterId: string;
  public readonly itemId?: string;
  public readonly weaponItemId?: string;
  public readonly damage: number;
  public readonly maxLifetime: number;
  public readonly spriteUrl?: string | null;
  public readonly inGameScale: number;

  public elapsedTime: number = 0;
  public hasHit: boolean = false;
  public hitTile?: { x: number; y: number };
  public hitMobId?: string;
  public angle: number = 0;

  public rigidBody: planck.Body | null = null;
  private rigidWorld: MiningRigidWorld | null = null;

  public readonly initialPosition: Vector2D;

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

  constructor(
    id: string,
    characterId: string,
    initialPosition: Vector2D,
    initialVelocity: Vector2D,
    options?: ProjectileEntityOptions,
    rigidWorld?: MiningRigidWorld
  ) {
    super({
      position: { ...initialPosition },
      radius: 0.15,
      hasGravity: (options?.gravityScale ?? 0) > 0,
      gravityScale: options?.gravityScale ?? 0,
      mass: 0.2,
    });

    this.id = id;
    this.characterId = characterId;
    this.itemId = options?.itemId;
    this.weaponItemId = options?.weaponItemId;
    this.damage = options?.damage ?? 35;
    this.maxLifetime = options?.maxLifetime ?? 3.0;
    this.spriteUrl = options?.spriteUrl;
    this.inGameScale = typeof options?.inGameScale === 'number' && options.inGameScale > 0 ? options.inGameScale : 1.0;

    this.initialPosition = { ...initialPosition };
    this._position = { ...initialPosition };
    this._velocity = { ...initialVelocity };
    this.angle = Math.atan2(initialVelocity.y, initialVelocity.x);
    this.rigidWorld = rigidWorld ?? null;

    if (rigidWorld) {
      this.rigidBody = rigidWorld.createProjectileBody(
        id,
        initialPosition,
        initialVelocity,
        options
      );
    }
  }

  public override update(dt: number, grid?: MiningCollisionGrid): void {
    if (this.hasHit) return;

    this.elapsedTime += dt;
    if (this.elapsedTime >= this.maxLifetime) {
      this.hasHit = true;
      this.cleanup();
      return;
    }

    const prevX = this.position.x;
    const prevY = this.position.y;

    if (this.rigidBody) {
      const pos = this.rigidBody.getPosition();
      const vel = this.rigidBody.getLinearVelocity();
      this.position.x = pos.x;
      this.position.y = pos.y;
      this.velocity.x = vel.x;
      this.velocity.y = vel.y;
      this.angle = Math.atan2(vel.y, vel.x);
    } else {
      // Kinematic fallback
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
    }

    // Boundary check (allows open sky flight above ground up to y = -40, and wide horizontal trajectory)
    if (
      this.position.x < -20 ||
      this.position.x >= MINING_CONFIG.GRID_WIDTH + 20 ||
      this.position.y < -40 ||
      this.position.y >= MINING_CONFIG.GRID_HEIGHT + 10
    ) {
      this.hasHit = true;
      this.cleanup();
      return;
    }

    // Solid tile collision detection with anti-tunneling sub-stepping
    if (grid) {
      const dx = this.position.x - prevX;
      const dy = this.position.y - prevY;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / 0.25));

      for (let s = 1; s <= steps; s++) {
        const checkX = prevX + (dx * s) / steps;
        const checkY = prevY + (dy * s) / steps;
        const tx = Math.floor(checkX);
        const ty = Math.floor(checkY);

        // Clearance threshold from muzzle position prevents immediate self-collision with shooter's tile
        const spawnDist = Math.hypot(
          checkX - this.initialPosition.x,
          checkY - this.initialPosition.y
        );
        if (spawnDist < 0.35) {
          continue;
        }

        // Above ground (ty < 0) is open sky (no collision with ground or bedrock)
        if (ty < 0) {
          continue;
        }

        if (
          ty >= 0 &&
          ty < MINING_CONFIG.GRID_HEIGHT &&
          tx >= 0 &&
          tx < MINING_CONFIG.GRID_WIDTH
        ) {
          const tile = grid[ty]?.[tx];
          if (tile && isTileSolid(tile.type as any)) {
            this.hasHit = true;
            this.hitTile = { x: tx, y: ty };
            this.position.x = checkX;
            this.position.y = checkY;
            this.cleanup();
            return;
          }
        } else if (ty >= 0) {
          // Cavern boundary outer wall underground
          this.hasHit = true;
          this.position.x = Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 0.01, checkX));
          this.position.y = Math.min(MINING_CONFIG.GRID_HEIGHT - 0.01, checkY);
          this.cleanup();
          return;
        }
      }
    }
  }

  public cleanup(): void {
    if (this.rigidBody && this.rigidWorld) {
      this.rigidWorld.destroyBody(this.rigidBody);
      this.rigidBody = null;
    }
  }
}
