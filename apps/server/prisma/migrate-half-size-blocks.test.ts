import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE } from '@mine-me/shared';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAP_CONFIG_DOUBLED,
  MAP_CONFIG_HALVED,
  MIGRATION_KEY,
  ledgerKey,
  migrateSeedRows,
  scaleFromLedger,
  planBlock,
  planDatabase,
  planFluid,
  planGas,
  planItem,
  planMapConfig,
  planMob,
  planObjectEffect,
  runMigration,
  type DatabaseRows,
  type MigrationStore,
  type RowPlan,
} from './migrate-half-size-blocks';

const mapConfig = () => ({
  id: 'cfg', name: 'Default', isActive: true,
  gridWidth: 45, gridHeight: 45, cavernDensity: 42, cavernIterations: 3, cavernMinDepth: 4,
  tunnelCount: 5, tunnelMinLength: 15, tunnelMaxLength: 30, tunnelWidth: 1, tunnelMinDepth: 2,
  rockPercentage: 12, mineralPercentage: 10, chestCount: 4, copperiumPercentage: 4, silveriumPercentage: 2, silveriumMinDepth: 12, oreClusterChance: 65,
  gravity: 28, dynamiteBounciness: 0.45, dynamiteFriction: 0.4, dynamiteThrowPower: 14, dynamiteFuseSeconds: 4, rockGravityScale: 1.2, rockRestitution: 0.1,
  fallDamageMinSpeed: 11, fallDamagePerSpeed: 6, fallDamageMax: 80, rockDamageMinSpeed: 6, rockDamagePerSpeed: 5, rockDamageMax: 80,
  burnDamagePerSecond: 6, burnSeconds: 5, heatRadius: 2.5, heatDamagePerSecond: 1.5, mobSpawnCount: 3, mobSpawnMinDepth: 5,
});

describe('map config', () => {
  it('doubles distances, speeds and depths, halves damage per speed, and leaves percentages, counts, times and damage alone', () => {
    const row = mapConfig();
    const p = planMapConfig(row)!;
    expect(p.table).toBe('MiningMapConfig');
    expect(p.data).toMatchObject({
      gridWidth: 90, gridHeight: 90, cavernMinDepth: 8, tunnelMinLength: 30, tunnelMaxLength: 60, tunnelWidth: 2, tunnelMinDepth: 4,
      silveriumMinDepth: 24, mobSpawnMinDepth: 10, gravity: 56, dynamiteThrowPower: 28, fallDamageMinSpeed: 22, rockDamageMinSpeed: 12, heatRadius: 5,
      fallDamagePerSpeed: 3, rockDamagePerSpeed: 2.5,
    });
    const untouched = ['cavernDensity', 'cavernIterations', 'tunnelCount', 'rockPercentage', 'mineralPercentage', 'chestCount', 'copperiumPercentage', 'silveriumPercentage', 'oreClusterChance',
      'dynamiteBounciness', 'dynamiteFriction', 'dynamiteFuseSeconds', 'rockGravityScale', 'rockRestitution', 'fallDamageMax', 'rockDamageMax', 'burnDamagePerSecond', 'burnSeconds', 'heatDamagePerSecond', 'mobSpawnCount'];
    for (const key of untouched) expect(p.data).not.toHaveProperty(key);
  });

  it('covers every field in the lists, so removing one from the lists is caught', () => {
    const row = mapConfig();
    const p = planMapConfig(row)!;
    for (const key of [...MAP_CONFIG_DOUBLED, ...MAP_CONFIG_HALVED]) expect(p.data).toHaveProperty(key);
    expect(Object.keys(p.data).sort()).toEqual([...MAP_CONFIG_DOUBLED, ...MAP_CONFIG_HALVED].sort());
  });

  it('halving damage per speed keeps the damage of the same impact: twice the speed over the minimum, half the damage per speed', () => {
    const before = (11 + 5 - 11) * 6; // an impact 5 tiles/s over the minimum
    const p = planMapConfig(mapConfig())!;
    const after = (11 * 2 + 5 * 2 - (p.data.fallDamageMinSpeed as number)) * (p.data.fallDamagePerSpeed as number);
    expect(after).toBe(before);
  });
});

describe('mobs', () => {
  it('doubles speed, jump force and the block-sized AI numbers, and keeps times, health and the rest of the AI config', () => {
    const p = planMob({
      id: 'm', name: 'Mole', moveSpeed: 1, jumpForce: 6.5, health: 50, hitStunMs: 250,
      aiConfig: { mineRange: 1.1, aggroRange: 12, attackRange: 1.1, jumpCooldownMs: 600, mineCooldownMs: 400, spriteUrl: '/x.png', showHealthBar: false, colliderWidth: 0.8, colliderHeight: 1.25 },
    })!;
    expect(p.data).toEqual({
      moveSpeed: 2, jumpForce: 13,
      aiConfig: { mineRange: 2.2, aggroRange: 24, attackRange: 2.2, jumpCooldownMs: 600, mineCooldownMs: 400, spriteUrl: '/x.png', showHealthBar: false, colliderWidth: 1.6, colliderHeight: 2.5 },
    });
  });

  it('a mob with nothing in blocks yields nothing', () => {
    expect(planMob({ id: 'm', name: 'Rock', moveSpeed: 0, jumpForce: 0, aiConfig: { showHealthBar: false } })).toBeNull();
    expect(planMob({ id: 'm', name: 'Plain', moveSpeed: 0, jumpForce: 0, aiConfig: null })).toBeNull();
  });
});

describe('items', () => {
  it('doubles light radii, throw power and projectile speed, but not pixel offsets, scale or timings', () => {
    const p = planItem({
      id: 'i', name: 'Thing', inGameScale: 1.2, holdOffsetX: 4, muzzleOffsetX: 30, heldParticleOffsetY: 6,
      physicsConfig: { throwPower: 14, colliderWidth: 32, colliderHeight: 10, fuseSeconds: 4, mass: 1 },
      lightConfig: { radius: 1.8, intensity: 0.5, pulseSpeed: 2 },
      heldLightConfig: { radius: 3.5, offsetX: 3, offsetY: -2 },
      projectileConfig: { projectileSpeed: 28, fireRate: 6, reloadTime: 1.5, maxLifetime: 3 },
    })!;
    expect(p.data).toEqual({
      physicsConfig: { throwPower: 28, colliderWidth: 32, colliderHeight: 10, fuseSeconds: 4, mass: 1 },
      lightConfig: { radius: 3.6, intensity: 0.5, pulseSpeed: 2 },
      heldLightConfig: { radius: 7, offsetX: 3, offsetY: -2 },
      projectileConfig: { projectileSpeed: 56, fireRate: 6, reloadTime: 1.5, maxLifetime: 3 },
    });
  });

  it('skips items with none of these, and null configs', () => {
    expect(planItem({ id: 'i', name: 'Plain', physicsConfig: null, lightConfig: null, heldLightConfig: null, projectileConfig: null })).toBeNull();
  });
});

describe('fluids, gases and blocks', () => {
  it('fluid: pocket size and depth, glow and flame light', () => {
    const p = planFluid({
      id: 'f', name: 'Lava', light: { radius: 5, intensity: 0.9 },
      generation: { mode: 'POCKET', minSize: 2, maxSize: 4, minDepth: 15, maxDepth: null, percentage: 3 },
      flammability: { heat: 3, burnDuration: 4, flameLight: { radius: 3.2, intensity: 0.75 } },
    })!;
    expect(p.data).toEqual({
      light: { radius: 10, intensity: 0.9 },
      generation: { mode: 'POCKET', minSize: 4, maxSize: 8, minDepth: 30, maxDepth: null, percentage: 3 },
      flammability: { heat: 3, burnDuration: 4, flameLight: { radius: 6.4, intensity: 0.75 } },
    });
  });

  it('fluid: a bounded maxDepth doubles, null stays null, percentages stay', () => {
    const p = planFluid({ id: 'f', name: 'X', generation: { minSize: 3, maxSize: 3, minDepth: 2, maxDepth: 10, percentage: 7 } })!;
    expect(p.data.generation).toEqual({ minSize: 6, maxSize: 6, minDepth: 4, maxDepth: 20, percentage: 7 });
  });

  it('gas: the explosion blast radius and front speed double too', () => {
    const p = planGas({
      id: 'g', name: 'Hydrogen',
      generation: { minSize: 2, maxSize: 10, minDepth: 3, maxDepth: null, percentage: 3, concentration: 1 },
      flammability: { heat: 4, flameLight: { radius: 3 }, explosion: { damage: 8, frontSpeed: 3, blastRadius: 3, minConcentration: 0.1 } },
    })!;
    expect(p.data.flammability).toEqual({ heat: 4, flameLight: { radius: 6 }, explosion: { damage: 8, frontSpeed: 6, blastRadius: 6, minConcentration: 0.1 } });
    expect(p.data.generation).toEqual({ minSize: 4, maxSize: 20, minDepth: 6, maxDepth: null, percentage: 3, concentration: 1 });
  });

  it('block: the flame light of a block that burns', () => {
    const p = planBlock({ id: 'b', name: 'Crate', flammability: { heat: 2, flameLight: { radius: 2 } } })!;
    expect(p.data).toEqual({ flammability: { heat: 2, flameLight: { radius: 4 } } });
    expect(planBlock({ id: 'b', name: 'Dirt', flammability: null })).toBeNull();
  });
});

describe('effect values', () => {
  const link = (flags: Record<string, boolean>, value: number) => ({ id: 'l', value, effect: { name: 'E', ...flags } });

  it('doubles the Explosion radius and the Knockback strength, found by their flags and never by name', () => {
    expect(planObjectEffect(link({ explodes: true }, 3), 'Dynamite')!.data).toEqual({ value: 6 });
    expect(planObjectEffect(link({ knockbackModifier: true }, 45), 'Pick')!.data).toEqual({ value: 90 });
    expect(planObjectEffect({ id: 'l', value: 3, effect: { name: 'Explosion' } }, 'Dynamite')).toBeNull(); // named "Explosion" but no flag
  });

  it('leaves every other effect alone (damage, mining speed, pick power...)', () => {
    for (const flag of ['damageModifier', 'miningSpeedModifier', 'toolDamageModifier', 'pickPowerModifier', 'healthGain', 'ignites']) {
      expect(planObjectEffect(link({ [flag]: true }, 25), 'Thing')).toBeNull();
    }
  });
});

describe('the whole database', () => {
  const rows = (): DatabaseRows => ({
    mapConfigs: [mapConfig()],
    mobs: [{ id: 'm', name: 'Mole', moveSpeed: 1, jumpForce: 6.5, aiConfig: { aggroRange: 12 } }],
    items: [{ id: 'i', name: 'Torch', lightConfig: { radius: 2 } }],
    fluids: [{ id: 'f', name: 'Water', generation: { minSize: 3, maxSize: 6, minDepth: 2, maxDepth: null } }],
    gases: [],
    blocks: [],
    itemEffects: [
      { id: 'l1', value: 3, effect: { name: 'Explosion', explodes: true }, item: { name: 'Dynamite' }, mob: null },
      { id: 'l2', value: 25, effect: { name: 'Damage', damageModifier: true } as any, item: { name: 'Sword' }, mob: null },
    ],
  });

  it('plans one change per row that has block-sized numbers', () => {
    const plans = planDatabase(rows());
    expect(plans.map((p) => `${p.table}:${p.id}`).sort()).toEqual(['Fluid:f', 'Item:i', 'MiningMapConfig:cfg', 'Mob:m', 'ObjectEffects:l1']);
  });

  /** An in-memory store that records what is written. `ledger` starts as the keys already in the ledger table. */
  const memoryStore = (ledger: string[] = []) => {
    const state = { ledger: [...ledger], writes: [] as RowPlan[][], summaries: [] as string[] };
    const store: MigrationStore = {
      ledgerKeys: async () => [...state.ledger],
      load: async () => rows(),
      apply: async (plans, summary, newScale) => {
        state.writes.push(plans);
        state.summaries.push(summary);
        state.ledger = [ledgerKey(newScale)]; // the real store drops the old scale and records the new one
      },
    };
    return { state, store };
  };

  it('reads the scale from the ledger: nothing means the original game, and the first 2x key still counts', () => {
    expect(scaleFromLedger([])).toBe(1);
    expect(scaleFromLedger([MIGRATION_KEY])).toBe(2);
    expect(scaleFromLedger(['block-scale-3x'])).toBe(3);
    expect(scaleFromLedger(['unrelated'])).toBe(1);
    expect(ledgerKey(3)).toBe('block-scale-3x');
    expect(ledgerKey(2)).toBe(MIGRATION_KEY);
  });

  it('a dry run reports every change and writes nothing', async () => {
    const { state, store } = memoryStore();
    const lines: string[] = [];
    const result = await runMigration(store, false, (l) => lines.push(l), 3);
    expect(result.status).toBe('dry-run');
    expect(state.writes).toEqual([]);
    expect(lines.join('\n')).toContain('Scaling the data from 1x to 3x');
    expect(lines.join('\n')).toContain('Mob Mole: moveSpeed: 1 -> 3');
    expect(lines.join('\n')).toContain('Dry run');
  });

  it('applying writes all the changes once, and a second run at the same scale does nothing', async () => {
    const { state, store } = memoryStore();
    const first = await runMigration(store, true, () => {}, 3);
    expect(first.status).toBe('applied');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toHaveLength(5);
    expect(state.ledger).toEqual(['block-scale-3x']);

    const lines: string[] = [];
    const second = await runMigration(store, true, (l) => lines.push(l), 3);
    expect(second.status).toBe('already-applied');
    expect(state.writes).toHaveLength(1);
    expect(lines.join('\n')).toContain('Already applied');
  });

  it('going from 2x to 3x multiplies by 1.5, and from 3x back to the original divides by 3', async () => {
    const up = memoryStore([MIGRATION_KEY]);
    const lines: string[] = [];
    await runMigration(up.store, false, (l) => lines.push(l), 3);
    expect(lines.join('\n')).toContain('from 2x to 3x');
    expect(planDatabase(rows(), 1.5).find((p) => p.table === 'Mob')!.data).toMatchObject({ moveSpeed: 1.5, jumpForce: 9.75 });

    const down = planDatabase({ ...rows(), mobs: [{ id: 'm', name: 'Mole', moveSpeed: 3, jumpForce: 19.5, aiConfig: { aggroRange: 36 } }] }, 1 / 3).find((p) => p.table === 'Mob')!;
    expect(down.data).toEqual({ moveSpeed: 1, jumpForce: 6.5, aiConfig: { aggroRange: 12 } });
  });

  it('whole-number map columns stay whole numbers', () => {
    const p = planDatabase({ ...rows(), mapConfigs: [mapConfig()] }, 3).find((x) => x.table === 'MiningMapConfig')!;
    for (const key of ['gridWidth', 'gridHeight', 'cavernMinDepth', 'tunnelMinLength', 'tunnelMaxLength', 'tunnelWidth', 'tunnelMinDepth', 'silveriumMinDepth', 'mobSpawnMinDepth']) {
      expect(Number.isInteger(p.data[key])).toBe(true);
    }
    expect(p.data).toMatchObject({ gridWidth: 135, tunnelWidth: 3, gravity: 84 });
  });
});

describe('the dev seed files', () => {
  const dataDir = path.resolve(__dirname, '../../../packages/shared/src/data');
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));

  it('are already at 3x: converting them again would change them, so it must not be run twice', () => {
    expect(read('mining_map_config.json').gridWidth).toBe(45 * BLOCK_SCALE);
    const mole = read('mobs.json').find((m: any) => m.id === 'cmn_mole_person_001');
    expect(mole.aiConfig.aggroRange).toBe(12 * BLOCK_SCALE);
    expect(mole.moveSpeed).toBe(1 * BLOCK_SCALE);
    const dynamite = read('items.json').find((i: any) => i.name === 'Dynamite');
    expect(dynamite.physicsConfig.throwPower).toBe(20.5 * BLOCK_SCALE);
    expect(dynamite.itemEffects.find((e: any) => e.effect.explodes).value).toBe(3 * BLOCK_SCALE);
  });

  it('migrateSeedRows converts rows the same way as the database planners, and leaves other files alone', () => {
    const converted = migrateSeedRows('mobs.json', [{ id: 'm', name: 'Mole', moveSpeed: 1, jumpForce: 6.5, mobEffects: [{ id: 'l', value: 3, effect: { explodes: true } }] }]);
    expect(converted.rows).toEqual([{ id: 'm', name: 'Mole', moveSpeed: 2, jumpForce: 13, mobEffects: [{ id: 'l', value: 6, effect: { explodes: true } }] }]);
    const other = migrateSeedRows('effects.json', [{ id: 'e', name: 'Damage' }]);
    expect(other.rows).toEqual([{ id: 'e', name: 'Damage' }]);
    expect(other.changes).toEqual([]);
  });
});
