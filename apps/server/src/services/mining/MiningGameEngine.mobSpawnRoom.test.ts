import { describe, it, expect, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';

describe('cavern mobs spawn where their body fits', () => {
  const engineFor = (seed: number) =>
    new MiningGameEngine({
      characterId: 'spawn-char', cityId: 'c', seed, socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 6, allowedMobIds: ['cmn_mole_person_001'] },
    });

  it.each([1, 5, 9, 12, 33])('seed %i: no mob starts inside solid ground', (seed) => {
    const engine = engineFor(seed);
    const mobs = [...engine.activeMobs.values()].filter((m) => m.mobId !== 'mob_target_dummy');
    expect(mobs).toHaveLength(6);
    for (const mob of mobs) {
      const body = mob.mobBody;
      expect(body.checkTileCollision(body.position.x, body.position.y, engine.grid)).toBe(false);
    }
  });

  it('stands them on the ground, not in the air', () => {
    const engine = engineFor(5);
    for (const mob of [...engine.activeMobs.values()].filter((m) => m.mobId !== 'mob_target_dummy')) {
      const body = mob.mobBody;
      expect(body.checkGround(engine.grid).isGrounded).toBe(true);
    }
  });
});
