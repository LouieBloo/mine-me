import { MiningPhysicsBody, type MiningCollisionGrid } from './MiningPhysicsBody';
import { type Vector2D, MINING_CONFIG, raycastSolidTiles } from '@mine-me/shared';

/** A bullet does not hit the tiles right at its muzzle, so a shooter pressed against a wall can still fire. */
const MUZZLE_CLEARANCE = 0.35;

export interface ProjectileEntityOptions {
  /** Fraction of world gravity applied to the bullet (0 = flies straight). */
  gravityScale?: number;
  itemId?: string;
  damage?: number;
  weaponItemId?: string;
  maxLifetime?: number;
  /** Mobs the bullet passes through before the next one stops it. */
  pierceCount?: number;
  spriteUrl?: string | null;
  inGameScale?: number;
}

/**
 * Server-authoritative projectile (e.g. 6-shooter revolver bullet).
 * A plain kinematic body: it integrates its own gravity and every step is tested against the tile
 * grid with an exact swept ray, so it can neither tunnel nor ricochet. (Planck is for bodies that
 * tumble and bounce; a bullet dies on first contact.)
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
  /** True when the bullet ended by timing out or leaving the world rather than hitting something. */
  public expired: boolean = false;
  /** Where the bullet was at the start of its last update; with `position` it is the segment it swept. */
  public previousPosition: Vector2D;
  /** Collision radius of the bullet itself when tested against mobs. */
  public readonly hitRadius = 0.12;
  public hitTile?: { x: number; y: number };
  public hitMobId?: string;
  /** Mobs already damaged by this bullet; a piercing bullet never hits the same one twice. */
  public readonly hitMobIds = new Set<string>();
  /** Further mobs the bullet can pass through. */
  public pierceRemaining: number;
  public angle: number = 0;

  public readonly initialPosition: Vector2D;

  public override get position(): Vector2D {
    return this._position;
  }
  public override set position(pos: Vector2D) {
    this._position = { ...pos };
  }

  public override get velocity(): Vector2D {
    return this._velocity;
  }
  public override set velocity(vel: Vector2D) {
    this._velocity = { ...vel };
  }

  constructor(
    id: string,
    characterId: string,
    initialPosition: Vector2D,
    initialVelocity: Vector2D,
    options?: ProjectileEntityOptions
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
    this.pierceRemaining = Math.max(0, Math.floor(options?.pierceCount ?? 0));
    this.spriteUrl = options?.spriteUrl;
    this.inGameScale = typeof options?.inGameScale === 'number' && options.inGameScale > 0 ? options.inGameScale : 1.0;

    this.initialPosition = { ...initialPosition };
    this.previousPosition = { ...initialPosition };
    this._position = { ...initialPosition };
    this._velocity = { ...initialVelocity };
    this.angle = Math.atan2(initialVelocity.y, initialVelocity.x);
  }

  public override update(dt: number, grid?: MiningCollisionGrid): void {
    if (this.hasHit) return;

    this.elapsedTime += dt;
    this.previousPosition = { x: this.position.x, y: this.position.y };
    if (this.elapsedTime >= this.maxLifetime) {
      this.hasHit = true;
      this.expired = true;
      return;
    }

    const prev = this.previousPosition;

    if (this.hasGravity) {
      this.velocity.y += MINING_CONFIG.GRAVITY * this.gravityScale * dt;
    }
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.angle = Math.atan2(this.velocity.y, this.velocity.x);

    // Boundary check (allows open sky flight above ground up to y = -40, and wide horizontal trajectory)
    if (
      this.position.x < -20 ||
      this.position.x >= MINING_CONFIG.GRID_WIDTH + 20 ||
      this.position.y < -40 ||
      this.position.y >= MINING_CONFIG.GRID_HEIGHT + 10
    ) {
      this.hasHit = true;
      this.expired = true;
      return;
    }

    if (!grid) return;
    const hit = raycastSolidTiles(grid, prev, this.position, {
      ignore: (h) =>
        Math.hypot(h.point.x - this.initialPosition.x, h.point.y - this.initialPosition.y) < MUZZLE_CLEARANCE,
    });
    if (hit) {
      this.hasHit = true;
      this.hitTile = hit.tile ?? undefined;
      this.position.x = hit.point.x;
      this.position.y = hit.point.y;
    }
  }
}
