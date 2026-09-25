import { describe, it, expect } from 'vitest';
import { MiningRigidWorld, calculateThrowVelocity } from '../src/physics/MiningRigidWorld';
import { MiningTileType } from '../src/types/mining';

describe('MiningRigidWorld (Planck.js Integration)', () => {
  it('creates world with default gravity pointing downwards', () => {
    const rigidWorld = new MiningRigidWorld();
    expect(rigidWorld.config.gravityEnabled).toBe(true);
    expect(rigidWorld.config.gravity).toBe(28.0);
    const g = rigidWorld.world.getGravity();
    expect(g.x).toBe(0);
    expect(g.y).toBe(28.0);
  });

  it('can toggle gravity on and off dynamically', () => {
    const rigidWorld = new MiningRigidWorld();
    rigidWorld.updateGravity(false);
    expect(rigidWorld.world.getGravity().y).toBe(0);

    rigidWorld.updateGravity(true, 15.0);
    expect(rigidWorld.world.getGravity().y).toBe(15.0);
  });

  it('adds, detects, and removes tile colliders for destructible terrain', () => {
    const rigidWorld = new MiningRigidWorld({ width: 10, height: 10 });
    expect(rigidWorld.hasTileCollider(3, 4)).toBe(false);

    rigidWorld.addTileCollider(3, 4);
    expect(rigidWorld.hasTileCollider(3, 4)).toBe(true);

    const removed = rigidWorld.removeTileCollider(3, 4);
    expect(removed).toBe(true);
    expect(rigidWorld.hasTileCollider(3, 4)).toBe(false);

    // Removing non-existent collider returns false
    expect(rigidWorld.removeTileCollider(3, 4)).toBe(false);
  });

  it('populates tile colliders from grid matrix', () => {
    const rigidWorld = new MiningRigidWorld({ width: 5, height: 5 });
    const grid: any = {
      0: { 0: { type: MiningTileType.EMPTY }, 1: { type: MiningTileType.DIRT } },
      1: { 0: { type: MiningTileType.ROCK }, 1: { type: MiningTileType.EMPTY } },
    };

    rigidWorld.setGrid(grid);
    expect(rigidWorld.hasTileCollider(0, 0)).toBe(false);
    expect(rigidWorld.hasTileCollider(1, 0)).toBe(true);
    expect(rigidWorld.hasTileCollider(0, 1)).toBe(true);
    expect(rigidWorld.hasTileCollider(1, 1)).toBe(false);
  });

  it('simulates dynamic dynamite with gravity and rotational tumbling', () => {
    const rigidWorld = new MiningRigidWorld();
    const dynamite = rigidWorld.createDynamiteBody(
      'dyn-1',
      { x: 5, y: 5 },
      { x: 4, y: -2 },
      { angularVelocity: 6.0, bounciness: 0.5 }
    );

    expect(dynamite.getPosition().x).toBe(5);
    expect(dynamite.getPosition().y).toBe(5);
    expect(dynamite.getAngularVelocity()).toBe(6.0);

    // Step physics for 0.5s (15 steps of 1/30)
    for (let i = 0; i < 15; i++) {
      rigidWorld.step(1 / 30);
    }

    const pos = dynamite.getPosition();
    const angle = dynamite.getAngle();

    // Trajectory should have advanced horizontally and accelerated downward
    expect(pos.x).toBeGreaterThan(5);
    expect(pos.y).toBeGreaterThan(5); // Fell downwards
    // Should have rotated/tumbled
    expect(angle).not.toBe(0);
  });

  it('causes thrown dynamite to bounce off solid tile floors', () => {
    const rigidWorld = new MiningRigidWorld();
    // Create a solid floor tile at y=10
    rigidWorld.addTileCollider(5, 10);

    // Drop dynamite directly above floor tile
    const dynamite = rigidWorld.createDynamiteBody(
      'dyn-bounce',
      { x: 5.5, y: 8.5 },
      { x: 0, y: 10 },
      { bounciness: 0.6 }
    );

    let bounced = false;
    for (let i = 0; i < 30; i++) {
      rigidWorld.step(1 / 30);
      const velY = dynamite.getLinearVelocity().y;
      // If velocity reversed to negative, it bounced off the floor
      if (velY < -0.5) {
        bounced = true;
        break;
      }
    }

    expect(bounced).toBe(true);
  });

  it('simulates falling rock entity and settles', () => {
    const rigidWorld = new MiningRigidWorld();
    rigidWorld.addTileCollider(3, 8);

    const rock = rigidWorld.createRockBody('rock-1', { x: 3.5, y: 5.0 });

    for (let i = 0; i < 30; i++) {
      rigidWorld.step(1 / 30);
    }

    // Rock should have fallen towards tile collider at y=8 and be resting on top
    const finalPos = rock.getPosition();
    expect(finalPos.y).toBeGreaterThan(5.0);
    expect(finalPos.y).toBeLessThan(8.0);
  });

  it('creates rectangular hotdog collider with dimensions matching MINING_TILE_WORLD_PIXELS scale', () => {
    const rigidWorld = new MiningRigidWorld();
    const dynamite = rigidWorld.createDynamiteBody(
      'dyn-hotdog',
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      {
        physicsConfig: {
          hasPhysics: true,
          colliderType: 'RECTANGLE',
          colliderWidth: 32,
          colliderHeight: 10,
        },
      }
    );

    const fixture = dynamite.getFixtureList();
    expect(fixture).not.toBeNull();
    const shape = fixture!.getShape() as any;
    expect(shape.getType()).toBe('polygon');

    // Expected half-width: (32 / 64) / 2 = 0.25 tiles
    // Expected half-height: (10 / 64) / 2 = 0.078125 tiles
    const v0 = shape.m_vertices[0];
    expect(Math.abs(v0.x)).toBeCloseTo(0.25, 4);
    expect(Math.abs(v0.y)).toBeCloseTo(0.078125, 4);
  });

  it('creates circle collider with radius matching MINING_TILE_WORLD_PIXELS scale', () => {
    const rigidWorld = new MiningRigidWorld();
    const dynamite = rigidWorld.createDynamiteBody(
      'dyn-circle',
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      {
        physicsConfig: {
          hasPhysics: true,
          colliderType: 'CIRCLE',
          colliderRadius: 16,
        },
      }
    );

    const fixture = dynamite.getFixtureList();
    expect(fixture).not.toBeNull();
    const shape = fixture!.getShape() as any;
    expect(shape.getType()).toBe('circle');
    // Expected radius: 16 / 64 = 0.25 tiles
    expect(shape.m_radius).toBeCloseTo(0.25, 4);
  });

  describe('calculateThrowVelocity', () => {
    it('scales velocity relative to cursor distance (closer cursor produces smaller toss)', () => {
      const closeVelocity = calculateThrowVelocity(5, 5, 7, 5, 1.0, 20.5);
      const farVelocity = calculateThrowVelocity(5, 5, 15, 5, 1.0, 20.5);

      const closeSpeed = Math.hypot(closeVelocity.x, closeVelocity.y);
      const farSpeed = Math.hypot(farVelocity.x, farVelocity.y);

      expect(closeSpeed).toBeLessThan(farSpeed);
      expect(closeVelocity.x).toBeGreaterThan(0);
      expect(farVelocity.x).toBeGreaterThan(closeVelocity.x);
    });

    it('scales velocity linearly with forceRatio', () => {
      const halfForce = calculateThrowVelocity(5, 5, 12, 5, 0.5, 20.5);
      const fullForce = calculateThrowVelocity(5, 5, 12, 5, 1.0, 20.5);

      expect(halfForce.x).toBeCloseTo(fullForce.x * 0.5, 4);
      expect(halfForce.y).toBeCloseTo(fullForce.y * 0.5, 4);
    });

    it('caps initial speed at maximum throwPower', () => {
      const extremeVelocity = calculateThrowVelocity(5, 5, 100, -50, 1.0, 20.5);
      const speed = Math.hypot(extremeVelocity.x, extremeVelocity.y);
      expect(speed).toBeCloseTo(20.5, 3);
    });
  });

  describe('createItemBody', () => {
    it('creates dynamic body with square half-tile collider and fixed rotation', () => {
      const rigidWorld = new MiningRigidWorld({ width: 10, height: 10, gravity: 28 });
      const itemBody = rigidWorld.createItemBody('item-1', { x: 5, y: 2 }, { x: 1, y: -2 });

      expect(itemBody.getType()).toBe('dynamic');
      expect(itemBody.isFixedRotation()).toBe(true);
      expect(itemBody.getUserData()).toEqual({ id: 'item-1', type: 'item' });

      // Fixture shape should be a Box (Polygon) with half-width 0.25 and half-height 0.25
      const fixture = itemBody.getFixtureList();
      expect(fixture).toBeDefined();
      const shape: any = fixture?.getShape();
      expect(shape.getType()).toBe('polygon');
      // Total width and height = 0.5 tiles (half of a normal 1.0 tile)
      expect(shape.m_vertices.length).toBe(4);

      // Simulate gravity: item should fall downwards
      rigidWorld.addTileCollider(5, 5); // Solid floor tile at y=5 (center at 5.5, 5.5)
      for (let i = 0; i < 30; i++) {
        rigidWorld.step(0.033);
      }

      // Item should have fallen from y=2 and landed near the top of the tile floor
      expect(itemBody.getPosition().y).toBeGreaterThan(2);
      expect(itemBody.getPosition().y).toBeLessThan(5.5);
    });
  });
});

