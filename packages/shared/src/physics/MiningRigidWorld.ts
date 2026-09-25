import * as planck from 'planck';
import { MINING_CONFIG, MINING_TILE_WORLD_PIXELS, type Vector2D, isTileSolid, type MiningTileType } from '../types/mining';
import type { MiningCollisionGrid } from './MiningPhysicsBody';
import type { ItemPhysicsConfig } from '../types';
import { DEFAULT_DYNAMITE_PHYSICS_CONFIG } from '../constants';

export interface RigidWorldConfig {
  width?: number;
  height?: number;
  gravityEnabled?: boolean;
  gravity?: number;
  dynamiteBounciness?: number;
  dynamiteFriction?: number;
  dynamiteThrowPower?: number;
  dynamiteFuseSeconds?: number;
  rockGravityScale?: number;
  rockRestitution?: number;
}

export interface DynamiteBodyOptions {
  bounciness?: number;
  friction?: number;
  angularVelocity?: number;
  density?: number;
  mass?: number;
  physicsConfig?: ItemPhysicsConfig;
  explosionRadius?: number;
}

export interface RockBodyOptions {
  gravityScale?: number;
  restitution?: number;
  friction?: number;
  density?: number;
}

export interface ItemBodyOptions {
  gravityScale?: number;
  restitution?: number;
  friction?: number;
  density?: number;
  linearDamping?: number;
  angularDamping?: number;
}

export interface RigidEntityData {
  id: string;
  type: 'dynamite' | 'rock' | 'projectile' | 'item';
}

/**
 * Lightweight Box2D (Planck.js) Rigid Body World Manager for Mine-Me.
 * Coordinates continuous rigid-body simulation for props (dynamite tumbling, falling rocks, bullets)
 * alongside destructible static tile geometry.
 */
export class MiningRigidWorld {
  public readonly world: planck.World;
  public readonly config: {
    width: number;
    height: number;
    gravityEnabled: boolean;
    gravity: number;
    dynamiteBounciness: number;
    dynamiteFriction: number;
    dynamiteThrowPower: number;
    dynamiteFuseSeconds: number;
    rockGravityScale: number;
    rockRestitution: number;
  };

  private tileBodies: Map<string, planck.Body> = new Map();
  private boundaryBodies: planck.Body[] = [];

  constructor(config?: RigidWorldConfig) {
    this.config = {
      width: config?.width ?? MINING_CONFIG.GRID_WIDTH,
      height: config?.height ?? MINING_CONFIG.GRID_HEIGHT,
      gravityEnabled: config?.gravityEnabled ?? true,
      gravity: config?.gravity ?? MINING_CONFIG.GRAVITY,
      dynamiteBounciness: config?.dynamiteBounciness ?? 0.45,
      dynamiteFriction: config?.dynamiteFriction ?? 0.4,
      dynamiteThrowPower: config?.dynamiteThrowPower ?? 14.0,
      dynamiteFuseSeconds: config?.dynamiteFuseSeconds ?? 4.0,
      rockGravityScale: config?.rockGravityScale ?? 1.2,
      rockRestitution: config?.rockRestitution ?? 0.1,
    };

    const g = this.config.gravityEnabled ? this.config.gravity : 0;
    // Y points downward in screen/tile space
    this.world = new planck.World(planck.Vec2(0, g));

    this.initBoundaries();
  }

  /**
   * Initializes static boundaries preventing entities from escaping the cavern.
   */
  public initBoundaries(): void {
    // Clear any previous boundaries
    for (const body of this.boundaryBodies) {
      this.world.destroyBody(body);
    }
    this.boundaryBodies = [];

    const { width, height } = this.config;

    // Bedrock floor (Y = height)
    const floor = this.world.createBody({
      type: 'static',
      position: planck.Vec2(width / 2, height + 0.5),
    });
    floor.createFixture({
      shape: planck.Box(width / 2 + 10, 0.5),
      friction: 0.6,
      restitution: 0.2,
    });
    this.boundaryBodies.push(floor);

    // Left wall (X = -0.5)
    const leftWall = this.world.createBody({
      type: 'static',
      position: planck.Vec2(-0.5, height / 2),
    });
    leftWall.createFixture({
      shape: planck.Box(0.5, height / 2 + 20),
      friction: 0.4,
      restitution: 0.3,
    });
    this.boundaryBodies.push(leftWall);

    // Right wall (X = width + 0.5)
    const rightWall = this.world.createBody({
      type: 'static',
      position: planck.Vec2(width + 0.5, height / 2),
    });
    rightWall.createFixture({
      shape: planck.Box(0.5, height / 2 + 20),
      friction: 0.4,
      restitution: 0.3,
    });
    this.boundaryBodies.push(rightWall);
  }

  /**
   * Populate static tile colliders from a mining grid matrix.
   */
  public setGrid(grid: MiningCollisionGrid): void {
    this.clearTileColliders();

    const height = Math.min(this.config.height, Object.keys(grid).length);
    for (let y = 0; y < height; y++) {
      const row = grid[y];
      if (!row) continue;
      for (let x = 0; x < this.config.width; x++) {
        const tile = row[x];
        if (tile && isTileSolid(tile.type as MiningTileType)) {
          this.addTileCollider(x, y);
        }
      }
    }
  }

  /**
   * Adds a static box collider for a tile at (x, y).
   */
  public addTileCollider(x: number, y: number): planck.Body {
    const key = `${x},${y}`;
    const existing = this.tileBodies.get(key);
    if (existing) return existing;

    // Tile center is at (x + 0.5, y + 0.5) with half-width 0.5, half-height 0.5
    const body = this.world.createBody({
      type: 'static',
      position: planck.Vec2(x + 0.5, y + 0.5),
    });
    body.createFixture({
      shape: planck.Box(0.5, 0.5),
      friction: 0.5,
      restitution: 0.2,
    });
    body.setUserData({ type: 'tile', x, y });

    this.tileBodies.set(key, body);
    return body;
  }

  /**
   * Removes a static tile collider when mined or exploded.
   * Returns true if collider was present and destroyed.
   */
  public removeTileCollider(x: number, y: number): boolean {
    const key = `${x},${y}`;
    const body = this.tileBodies.get(key);
    if (body) {
      this.world.destroyBody(body);
      this.tileBodies.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Check if a static tile collider exists at (x, y).
   */
  public hasTileCollider(x: number, y: number): boolean {
    return this.tileBodies.has(`${x},${y}`);
  }

  /**
   * Clear all tile colliders.
   */
  public clearTileColliders(): void {
    for (const body of this.tileBodies.values()) {
      this.world.destroyBody(body);
    }
    this.tileBodies.clear();
  }

  /**
   * Creates a dynamic rigid body for thrown dynamite.
   * Bullet mode enabled for continuous collision detection (CCD).
   */
  public createDynamiteBody(
    id: string,
    position: Vector2D,
    velocity: Vector2D,
    options?: DynamiteBodyOptions
  ): planck.Body {
    const physicsConfig = options?.physicsConfig ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG;
    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(position.x, position.y),
      linearVelocity: planck.Vec2(velocity.x, velocity.y),
      angularVelocity: options?.angularVelocity ?? (Math.random() - 0.5) * 8.0,
      bullet: true, // CCD prevents tunneling through blocks
      gravityScale: physicsConfig?.gravityScale ?? 1.0,
      linearDamping: physicsConfig?.linearDamping ?? 0.05,
      angularDamping: physicsConfig?.angularDamping ?? 0.4,
      fixedRotation: physicsConfig?.allowRotation === false,
    });

    const bounciness = physicsConfig?.restitution ?? options?.bounciness ?? this.config.dynamiteBounciness;
    const friction = physicsConfig?.friction ?? options?.friction ?? this.config.dynamiteFriction;
    const density = options?.density ?? (physicsConfig?.mass ? physicsConfig.mass : 1.0);

    // 1 grid tile = 1.0 unit in Planck.js world space, and corresponds to 64px in screen rendering space.
    // Collider dimensions are specified in pixels (e.g. 32px width = 0.5 tiles, 10px height = 0.15625 tiles).
    const tilePixels = MINING_TILE_WORLD_PIXELS;

    if (physicsConfig?.colliderType === 'CIRCLE') {
      const radius = (physicsConfig.colliderRadius ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderRadius ?? 8) / tilePixels;
      const ox = (physicsConfig.colliderOffsetX ?? 0) / tilePixels;
      const oy = (physicsConfig.colliderOffsetY ?? 0) / tilePixels;
      body.createFixture({
        shape: planck.Circle(planck.Vec2(ox, oy), radius),
        density,
        restitution: bounciness,
        friction,
      });
    } else {
      // Default or RECTANGLE collider (horizontal hotdog shape 32x10)
      const w = physicsConfig?.colliderWidth ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderWidth ?? 32;
      const h = physicsConfig?.colliderHeight ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderHeight ?? 10;
      const hw = (w / tilePixels) / 2;
      const hh = (h / tilePixels) / 2;
      const ox = (physicsConfig?.colliderOffsetX ?? 0) / tilePixels;
      const oy = (physicsConfig?.colliderOffsetY ?? 0) / tilePixels;
      body.createFixture({
        shape: planck.Box(hw, hh, planck.Vec2(ox, oy)),
        density,
        restitution: bounciness,
        friction,
      });
    }

    const data: RigidEntityData = { id, type: 'dynamite' };
    body.setUserData(data);

    return body;
  }

  /**
   * Creates a dynamic rigid body for falling rocks.
   */
  public createRockBody(
    id: string,
    position: Vector2D,
    options?: RockBodyOptions
  ): planck.Body {
    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(position.x, position.y),
      linearVelocity: planck.Vec2(0, 0),
      angularVelocity: (Math.random() - 0.5) * 2.0,
      bullet: true,
      gravityScale: options?.gravityScale ?? this.config.rockGravityScale,
      linearDamping: 0.1,
      angularDamping: 0.5,
    });

    // Circle shape for rock rolling and falling
    body.createFixture({
      shape: planck.Circle(0.42),
      density: options?.density ?? 4.0, // Heavy rock mass
      restitution: options?.restitution ?? this.config.rockRestitution,
      friction: options?.friction ?? 0.6,
    });

    const data: RigidEntityData = { id, type: 'rock' };
    body.setUserData(data);

    return body;
  }

  /**
   * Creates a dynamic rigid body for dropped items.
   * Simple square collider of half normal tile size (0.5 x 0.5 tiles, or hx=0.25, hy=0.25).
   * Respects gravity, lands on tiles, and keeps fixed rotation for clean sprite rendering.
   */
  public createItemBody(
    id: string,
    position: Vector2D,
    velocity?: Vector2D,
    options?: ItemBodyOptions
  ): planck.Body {
    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(position.x, position.y),
      linearVelocity: planck.Vec2(velocity?.x ?? 0, velocity?.y ?? 0),
      bullet: true, // Prevents tunneling through blocks
      gravityScale: options?.gravityScale ?? 1.0,
      linearDamping: options?.linearDamping ?? 0.2,
      angularDamping: options?.angularDamping ?? 0.5,
      fixedRotation: true,
    });

    // Simple square collider, half a normal tile size (0.5 x 0.5 total dimension)
    body.createFixture({
      shape: planck.Box(0.25, 0.25),
      density: options?.density ?? 1.0,
      restitution: options?.restitution ?? 0.2,
      friction: options?.friction ?? 0.6,
    });

    const data: RigidEntityData = { id, type: 'item' };
    body.setUserData(data);

    return body;
  }

  /**
   * Destroys an active body from the physics world safely.
   */
  public destroyBody(body: planck.Body): void {
    this.world.destroyBody(body);
  }

  /**
   * Step the physics world by dt seconds.
   */
  public step(dt: number, velocityIterations: number = 8, positionIterations: number = 3): void {
    this.world.step(dt, velocityIterations, positionIterations);
  }

  /**
   * Update gravity settings dynamically (e.g. from Admin config changes).
   */
  public updateGravity(enabled: boolean, gravityVal?: number): void {
    this.config.gravityEnabled = enabled;
    if (gravityVal !== undefined) {
      this.config.gravity = gravityVal;
    }
    const g = this.config.gravityEnabled ? this.config.gravity : 0;
    this.world.setGravity(planck.Vec2(0, g));
  }

  /**
   * Cleans up all bodies in the world.
   */
  public destroy(): void {
    this.clearTileColliders();
    for (const body of this.boundaryBodies) {
      this.world.destroyBody(body);
    }
    this.boundaryBodies = [];
  }
}

/**
 * Calculates initial launch velocity for throwable entities targeted towards a cursor/target coordinate.
 * The arc is physically relative to cursor location (closer cursor -> lower velocity toss, further cursor -> higher toss),
 * clamped to throwPower, and scaled linearly by forceRatio.
 */
export function calculateThrowVelocity(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  forceRatio: number = 1.0,
  throwPower: number = 20.5,
  gravity: number = MINING_CONFIG.GRAVITY,
  gravityScale: number = 1.0,
  isFacingLeft: boolean = false
): Vector2D {
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.05) {
    const dirX = isFacingLeft ? -1 : 1;
    const speed = Math.min(throwPower, 6.0) * Math.max(0.05, Math.min(1.0, forceRatio));
    return { x: dirX * speed, y: -2.0 * forceRatio };
  }

  const effectiveGravity = Math.max(1.0, gravity * (gravityScale ?? 1.0));
  const dxAbs = Math.max(0.4, Math.abs(dx));
  const dyUp = Math.max(0, -dy);

  // Flight time tuned so trajectory is broad, flat, and forward-reaching rather than overly steep
  const t0 = Math.sqrt((2 * dxAbs) / (effectiveGravity * 3.6)) + Math.sqrt((2 * dyUp) / (effectiveGravity * 3.0));
  const flightTime = Math.min(0.70, Math.max(0.15, t0));

  let vx = dx / flightTime;
  let vy = dy / flightTime - 0.5 * effectiveGravity * flightTime;

  // Cap initial speed by maximum throwPower
  const currentSpeed = Math.hypot(vx, vy);
  if (currentSpeed > throwPower && currentSpeed > 0.001) {
    const scale = throwPower / currentSpeed;
    vx *= scale;
    vy *= scale;
  }

  // Scale linearly with forceRatio
  const clampedRatio = Math.min(1.0, Math.max(0.05, forceRatio));
  return {
    x: vx * clampedRatio,
    y: vy * clampedRatio,
  };
}
