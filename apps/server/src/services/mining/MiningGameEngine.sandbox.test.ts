import { describe, it, expect, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType } from '@mine-me/shared';
import { SANDBOX_SKY_ROWS } from './sandbox/SandboxLayout';

const SKY = SANDBOX_SKY_ROWS;

const start = (mapConfig = {}) =>
  new MiningGameEngine({
    characterId: 'sbx', cityId: 'c', seed: 1, gameMode: 'sandbox', maxHealth: 100,
    socket: { connected: true, emit: vi.fn() } as any,
    mapConfig: { surfaceDummyMobId: 'mob_target_dummy', mobSpawnCount: 3, ...mapConfig },
  });

describe('a sandbox room', () => {
  it('uses the hand-built 90x30 map under open sky, with its own physics size', () => {
    const e = start();
    expect(e.grid).toHaveLength(30 + SKY);
    expect(e.grid[0]).toHaveLength(90);
    expect(e.surfaceRow).toBe(SKY);
    expect((e.rigidWorld as any).config.width).toBe(90);
    expect((e.rigidWorld as any).config.height).toBe(30 + SKY);
  });

  it('starts with the two surface dummies and no random cavern mobs', () => {
    const mobs = start().getActiveMobs();
    expect(mobs).toHaveLength(2);
    expect(mobs.every((m) => m.mobId === 'mob_target_dummy')).toBe(true);
  });

  it('puts the pool fluid into the simulation and shows all of it to the client', () => {
    const e = start();
    expect(e.fluidSubsystem.contentsAt(38, SKY + 5)).toBeDefined();
    expect(e.fluidSubsystem.visibleSnapshot().length).toBeGreaterThan(0);
  });

  it('keeps the player inside the 90-wide map and lets them walk the surface', () => {
    const e = start();
    const me = e.players.get('sbx')!;
    me.playerBody.position = { x: 80, y: SKY - 1 };
    me.inputs = { ...me.inputs, right: true };
    for (let i = 0; i < 300; i++) (e as any).tick(1 / 30);
    expect(me.playerBody.position.x).toBeGreaterThan(60);
    expect(me.playerBody.position.x).toBeLessThanOrEqual(90);
  });

  it('settles the pools without spilling out onto the surface', () => {
    const e = start();
    for (let i = 0; i < 600; i++) (e as any).tick(1 / 30);
    for (let x = 0; x < 90; x++) {
      if ((x >= 32 && x <= 56 && x !== 44) || (x >= 1 && x <= 4)) continue;
      expect(e.fluidSubsystem.contentsAt(x, SKY)).toBeUndefined();
    }
  });

  it('spawns players on the ground surface, under the sky', () => {
    const e = start();
    const body = e.players.get('sbx')!.playerBody;
    expect(Math.round(body.position.x)).toBe(22);
    expect(Math.round(body.position.y)).toBe(SKY);
  });

  it('makes the generated modes unchanged: random size and cavern mobs', () => {
    const e = new MiningGameEngine({ characterId: 'n', cityId: 'c', seed: 1, socket: { connected: true, emit: vi.fn() } as any, mapConfig: { mobSpawnCount: 2, allowedMobIds: ['cmn_mole_person_001'], surfaceDummyMobId: 'mob_target_dummy' } });
    expect(e.grid).toHaveLength(45);
    expect(e.getActiveMobs().length).toBeGreaterThan(1);
    expect(e.grid[0][0].type).toBe(MiningTileType.DIRT);
    expect(e.surfaceRow).toBe(0);
    expect(Math.round(e.players.get('n')!.playerBody.position.y)).toBe(0);
  });
});
