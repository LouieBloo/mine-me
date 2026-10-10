import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadDefinitionsFromDatabase, loadDefinitionsFromFiles, installDefinitionsFromDatabase, attachMobSounds } from './definitionLoaders';
import { MiningDataManager } from './subsystems/MiningDataManager';

const fakePrisma = (data: { items?: any[]; mobs?: any[]; blocks?: any[]; sounds?: any[] }) =>
  ({
    item: { findMany: vi.fn().mockResolvedValue(data.items ?? [{ id: 'i1', name: 'Thing' }]) },
    mob: { findMany: vi.fn().mockResolvedValue(data.mobs ?? [{ id: 'm1', name: 'Mole' }]) },
    miningBlock: { findMany: vi.fn().mockResolvedValue(data.blocks ?? [{ id: 'b1', typeKey: 'DIRT' }]) },
    sound: { findMany: vi.fn().mockResolvedValue(data.sounds ?? []) },
  }) as any;

describe('loadDefinitionsFromDatabase', () => {
  it('queries items with effects & particle effect, mobs and blocks with drop tables', async () => {
    const prisma = fakePrisma({});
    const defs = await loadDefinitionsFromDatabase(prisma);
    expect(defs.items).toHaveLength(1);
    expect(prisma.item.findMany).toHaveBeenCalledWith({
      include: { itemEffects: { include: { effect: true } }, particleEffect: true },
    });
    expect(prisma.mob.findMany).toHaveBeenCalledWith({ include: { dropTable: { include: { items: true } }, mobEffects: { include: { effect: true } } } });
    expect(prisma.miningBlock.findMany).toHaveBeenCalledWith({
      include: { dropTable: { include: { items: true } }, idleParticleEffect: true },
    });
  });

  it('allows an empty mob table', async () => {
    await expect(loadDefinitionsFromDatabase(fakePrisma({ mobs: [] }))).resolves.toMatchObject({ mobs: [] });
  });

  it.each([
    ['no items', { items: [] }],
    ['no blocks', { blocks: [] }],
  ])('rejects an unseeded database (%s)', async (_n, data) => {
    await expect(loadDefinitionsFromDatabase(fakePrisma(data))).rejects.toThrow(/seeded/);
  });

  it('propagates database errors', async () => {
    const prisma = fakePrisma({});
    prisma.item.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(loadDefinitionsFromDatabase(prisma)).rejects.toThrow('connection refused');
  });
});

describe('mob sounds', () => {
  const library = [
    { id: 's1', url: '/assets/sounds/a.mp3', volume: 0.7, isActive: true },
    { id: 's2', url: '/assets/sounds/b.mp3', volume: 1, isActive: false },
  ];

  it('resolves stored sound references to playable urls', () => {
    const [mob] = attachMobSounds([{ id: 'm1', name: 'M', soundEffects: { attack: { soundId: 's1' }, death: { soundId: 's2' } } } as any], library);
    expect(mob.sounds).toEqual({ attack: { soundId: 's1', url: '/assets/sounds/a.mp3', volume: 0.7, loop: false } });
  });

  it('keeps plain-url sounds on mobs that have no references (seed JSON)', () => {
    const seeded = { id: 'm1', name: 'M', sounds: { dig: { url: '/assets/sounds/x.mp3' } } } as any;
    expect(attachMobSounds([seeded], library)[0].sounds).toEqual({ dig: { url: '/assets/sounds/x.mp3' } });
  });

  it('is applied by the database loader', async () => {
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ mobs: [{ id: 'm1', name: 'Mole', soundEffects: { idle: { soundId: 's1' } } }], sounds: library })
    );
    expect(defs.mobs[0].sounds?.idle?.url).toBe('/assets/sounds/a.mp3');
  });

  it('still loads when a referenced sound was deleted', async () => {
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ mobs: [{ id: 'm1', name: 'Mole', soundEffects: { idle: { soundId: 'gone' } } }] })
    );
    expect(defs.mobs[0].sounds).toEqual({});
  });
});

describe('installDefinitionsFromDatabase', () => {
  const original = MiningDataManager.getInstance();
  afterEach(() => {
    MiningDataManager.initialize({ items: original.getItems(), mobs: (original as any).mobs, blocks: [...(original as any).blocksByTypeKey.values()] });
  });

  it('installs loaded definitions for the mining engine', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await installDefinitionsFromDatabase(fakePrisma({ items: [{ id: 'cuid-1', itemKey: 'thing', name: 'Thing' }] }));
    expect(MiningDataManager.getInstance().getItemData('thing')?.id).toBe('cuid-1');
  });

  it('does not install anything when loading fails', async () => {
    const before = MiningDataManager.getInstance();
    await expect(installDefinitionsFromDatabase(fakePrisma({ items: [] }))).rejects.toThrow();
    expect(MiningDataManager.getInstance()).toBe(before);
  });
});

describe('loadDefinitionsFromFiles', () => {
  // Created per run and removed afterwards (a bare mkdtemp here used to leave a folder behind every run)
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'defs-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const write = (n: string, v: unknown) => fs.writeFileSync(path.join(tmp, n), JSON.stringify(v));

  it('reads the three seed files', () => {
    write('items.json', [{ id: 'a' }]);
    write('mobs.json', []);
    write('blocks.json', [{ typeKey: 'DIRT' }]);
    expect(loadDefinitionsFromFiles(tmp)).toEqual({ items: [{ id: 'a' }], mobs: [], blocks: [{ typeKey: 'DIRT' }] });
  });

  it('fails loudly on a missing file or non-array content', () => {
    write('items.json', {});
    expect(() => loadDefinitionsFromFiles(tmp)).toThrow(/array/);
    fs.rmSync(path.join(tmp, 'mobs.json'));
    write('items.json', []);
    expect(() => loadDefinitionsFromFiles(tmp)).toThrow();
  });
});
