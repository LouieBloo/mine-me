import { describe, it, expect, beforeEach } from 'vitest';
import { MiningProjectileEntity } from './MiningProjectileEntity';
import { MiningTileType, MINING_CONFIG, MiningRigidWorld } from '@mine-me/shared';
import type { ServerMiningGrid } from '../../miningMap.service';

function createEmptyGrid(): ServerMiningGrid {
  const grid: ServerMiningGrid = [];
  for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
      row.push({ type: MiningTileType.EMPTY, revealed: true });
    }
    grid.push(row);
  }
  return grid;
}

describe('MiningProjectileEntity', () => {
  let grid: ServerMiningGrid;

  beforeEach(() => {
    grid = createEmptyGrid();
  });

  it('initializes with position, velocity, damage, and calculated angle', () => {
    const proj = new MiningProjectileEntity(
      'proj-1',
      'char-1',
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { damage: 40, itemId: 'cmn_bullet_gun_round' }
    );

    expect(proj.id).toBe('proj-1');
    expect(proj.characterId).toBe('char-1');
    expect(proj.damage).toBe(40);
    expect(proj.position.x).toBe(10);
    expect(proj.position.y).toBe(5);
    expect(proj.velocity.x).toBe(20);
    expect(proj.velocity.y).toBe(0);
    expect(proj.angle).toBeCloseTo(0);
    expect(proj.hasHit).toBe(false);
  });

  it('updates position over time along velocity vector', () => {
    const proj = new MiningProjectileEntity(
      'proj-2',
      'char-1',
      { x: 5, y: 5 },
      { x: 10, y: 0 }
    );

    proj.update(0.1, grid);
    expect(proj.position.x).toBeCloseTo(6.0, 1);
    expect(proj.position.y).toBeCloseTo(5.0, 1);
    expect(proj.hasHit).toBe(false);
  });

  it('detects collision with solid tile and flags hasHit', () => {
    // Put a solid dirt block at x=8, y=5
    grid[5][8] = { type: MiningTileType.DIRT, revealed: true };

    const proj = new MiningProjectileEntity(
      'proj-3',
      'char-1',
      { x: 5, y: 5.5 },
      { x: 20, y: 0 }
    );

    // After 0.2s, moves 4 units to x=9, passing through x=8
    proj.update(0.2, grid);

    expect(proj.hasHit).toBe(true);
    expect(proj.hitTile).toBeDefined();
  });

  it('flags hasHit and terminates when exceeding lifetime', () => {
    const proj = new MiningProjectileEntity(
      'proj-4',
      'char-1',
      { x: 5, y: 5 },
      { x: 2, y: 0 },
      { maxLifetime: 1.0 }
    );

    proj.update(0.5, grid);
    expect(proj.hasHit).toBe(false);

    proj.update(0.6, grid);
    expect(proj.hasHit).toBe(true);
  });

  it('integrates seamlessly with MiningRigidWorld Planck.js physics simulation', () => {
    const rigidWorld = new MiningRigidWorld();
    const proj = new MiningProjectileEntity(
      'proj-phys-1',
      'char-1',
      { x: 5, y: 5 },
      { x: 15, y: 0 },
      { gravityScale: 0 },
      rigidWorld
    );

    expect(proj.rigidBody).not.toBeNull();

    // Step physics world
    rigidWorld.step(0.1);
    proj.update(0.1, grid);

    expect(proj.position.x).toBeGreaterThan(5.0);
    proj.cleanup();
    expect(proj.rigidBody).toBeNull();
    rigidWorld.destroy();
  });

  it('allows flight in open sky above ground (y < 0) without triggering collision or boundary cleanup prematurely', () => {
    const proj = new MiningProjectileEntity(
      'proj-sky-1',
      'char-1',
      { x: 10, y: -1.0 },
      { x: 20, y: -5 }
    );

    // Update 0.2s: moves to x=14, y=-2.0
    proj.update(0.2, grid);

    expect(proj.position.y).toBeLessThan(0);
    expect(proj.position.x).toBeCloseTo(14, 0.5);
    expect(proj.hasHit).toBe(false);
  });

  it('stores inGameScale when provided in options and defaults to 1.0', () => {
    const projScaled = new MiningProjectileEntity(
      'proj-scaled',
      'char-1',
      { x: 5, y: 5 },
      { x: 10, y: 0 },
      { inGameScale: 0.4, itemId: 'cmn_bullet_gun_round' }
    );
    expect(projScaled.inGameScale).toBe(0.4);

    const projDefault = new MiningProjectileEntity(
      'proj-default',
      'char-1',
      { x: 5, y: 5 },
      { x: 10, y: 0 }
    );
    expect(projDefault.inGameScale).toBe(1.0);
  });
});
