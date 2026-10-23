import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadDefinitionsFromDatabase, loadDefinitionsFromFiles, installDefinitionsFromDatabase, attachMobSounds, attachFluidSounds, attachGasSounds, attachExtractorSounds } from './definitionLoaders';
import { validateExtractor } from '@mine-me/shared';
import { MiningDataManager } from './subsystems/MiningDataManager';

const fakePrisma = (data: { items?: any[]; mobs?: any[]; blocks?: any[]; fluids?: any[]; gases?: any[]; extractors?: any[]; particleEffects?: any[]; sounds?: any[]; characterSounds?: any }) =>
  ({
    item: { findMany: vi.fn().mockResolvedValue(data.items ?? [{ id: 'i1', name: 'Thing' }]) },
    mob: { findMany: vi.fn().mockResolvedValue(data.mobs ?? [{ id: 'm1', name: 'Mole' }]) },
    miningBlock: { findMany: vi.fn().mockResolvedValue(data.blocks ?? [{ id: 'b1', typeKey: 'DIRT' }]) },
    fluid: { findMany: vi.fn().mockResolvedValue(data.fluids ?? []) },
    gas: { findMany: vi.fn().mockResolvedValue(data.gases ?? []) },
    extractor: { findMany: vi.fn().mockResolvedValue(data.extractors ?? []) },
    particleEffect: { findMany: vi.fn().mockResolvedValue(data.particleEffects ?? []) },
    sound: { findMany: vi.fn().mockResolvedValue(data.sounds ?? []) },
    characterSoundConfig: { findUnique: vi.fn().mockResolvedValue(data.characterSounds ?? null) },
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

describe('fluids', () => {
  const oil = { id: 'f1', typeKey: 'OIL', name: 'Oil', flammability: { ignitionChance: 1 } };

  it('loads the fluid table, oldest first', async () => {
    const prisma = fakePrisma({ fluids: [oil] });
    const defs = await loadDefinitionsFromDatabase(prisma);
    expect(defs.fluids).toEqual([oil]);
    expect(prisma.fluid.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
  });

  it('allows an empty fluid table', async () => {
    await expect(loadDefinitionsFromDatabase(fakePrisma({ fluids: [] }))).resolves.toMatchObject({ fluids: [] });
  });

  it('propagates database errors from the fluid table', async () => {
    const prisma = fakePrisma({});
    prisma.fluid.findMany.mockRejectedValue(new Error('no such table'));
    await expect(loadDefinitionsFromDatabase(prisma)).rejects.toThrow('no such table');
  });

  it('installs fluids so the running game can look them up', async () => {
    await installDefinitionsFromDatabase(fakePrisma({ fluids: [oil] }));
    expect(MiningDataManager.getInstance().getFluid('OIL')?.name).toBe('Oil');
    MiningDataManager.reset();
  });
});

describe('particle effects', () => {
  const flame = { id: 'pe1', name: 'Flame', type: 'CONTINUOUS', config: { emitterType: 'continuous' } };

  it('loads the particle effect library so fluids and fire can name an effect by id', async () => {
    const defs = await loadDefinitionsFromDatabase(fakePrisma({ particleEffects: [flame] }));
    expect(defs.particleEffects).toEqual([flame]);
  });

  it('lets the running game look an effect up by id', async () => {
    await installDefinitionsFromDatabase(fakePrisma({ particleEffects: [flame] }));
    expect(MiningDataManager.getInstance().getParticleEffect('pe1')?.name).toBe('Flame');
    expect(MiningDataManager.getInstance().getParticleEffect('nope')).toBeUndefined();
    expect(MiningDataManager.getInstance().getParticleEffect(null)).toBeUndefined();
    expect(MiningDataManager.getInstance().getParticleEffect(undefined)).toBeUndefined();
    MiningDataManager.reset();
  });

  it('allows an empty library', async () => {
    await expect(loadDefinitionsFromDatabase(fakePrisma({ particleEffects: [] }))).resolves.toMatchObject({ particleEffects: [] });
  });
});

describe('gases', () => {
  const hydrogen = { id: 'g1', typeKey: 'HYDROGEN', name: 'Hydrogen' };

  it('loads the gas table, oldest first', async () => {
    const prisma = fakePrisma({ gases: [hydrogen] });
    const defs = await loadDefinitionsFromDatabase(prisma);
    expect(defs.gases).toEqual([hydrogen]);
    expect(prisma.gas.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
  });

  it('allows an empty gas table', async () => {
    await expect(loadDefinitionsFromDatabase(fakePrisma({ gases: [] }))).resolves.toMatchObject({ gases: [] });
  });

  it('propagates database errors from the gas table', async () => {
    const prisma = fakePrisma({});
    prisma.gas.findMany.mockRejectedValue(new Error('no such table'));
    await expect(loadDefinitionsFromDatabase(prisma)).rejects.toThrow('no such table');
  });

  it('installs gases so the running game can look them up by key or id; the first of a duplicated key wins', async () => {
    await installDefinitionsFromDatabase(fakePrisma({ gases: [hydrogen, { ...hydrogen, id: 'g2', name: 'Copy' }, { id: 'g3', name: 'No key' }] }));
    const data = MiningDataManager.getInstance();
    expect(data.getGas('HYDROGEN')?.name).toBe('Hydrogen');
    expect(data.getGas('g1')?.name).toBe('Hydrogen');
    expect(data.getGases()).toHaveLength(1);
    expect(data.getGas('NOPE')).toBeUndefined();
  });

  it('reads the dev seed mirror, which has hydrogen and nitrogen', () => {
    const defs = loadDefinitionsFromFiles(path.resolve(__dirname, '../../../../../packages/shared/src/data'));
    expect(defs.gases?.map((g) => g.typeKey).sort()).toEqual(['HYDROGEN', 'NITROGEN']);
  });

  describe('sounds', () => {
    const library = [
      { id: 's1', url: '/assets/sounds/boom.mp3', volume: 0.7, isActive: true },
      { id: 's2', url: '/assets/sounds/off.mp3', volume: 1, isActive: false },
    ];

    it('resolves stored sound references to playable urls, at the volume set on this gas', () => {
      const [gas] = attachGasSounds([{ id: 'g1', typeKey: 'HYDROGEN', soundEffects: { explode: { soundId: 's1', volume: 0.3 }, vent: { soundId: 's2' } } } as any], library);
      expect(gas.sounds).toEqual({ explode: { soundId: 's1', url: '/assets/sounds/boom.mp3', volume: 0.3, loop: false } });
    });

    it('leaves a gas with no references alone, and is applied by the database loader', async () => {
      const plain = { id: 'g1', typeKey: 'NITROGEN' } as any;
      expect(attachGasSounds([plain], library)[0]).toBe(plain);
      const defs = await loadDefinitionsFromDatabase(fakePrisma({ gases: [{ id: 'g1', typeKey: 'HYDROGEN', soundEffects: { ignite: { soundId: 's1' } } }], sounds: library }));
      expect(defs.gases?.[0].sounds?.ignite).toMatchObject({ url: '/assets/sounds/boom.mp3', volume: 1 });
    });
  });
});

describe('fluid sounds', () => {
  const library = [
    { id: 's1', url: '/assets/sounds/splash.mp3', volume: 0.7, isActive: true },
    { id: 's2', url: '/assets/sounds/off.mp3', volume: 1, isActive: false },
  ];

  it('resolves stored sound references to playable urls, at the volume set on this fluid', () => {
    const [oil] = attachFluidSounds([{ id: 'f1', typeKey: 'OIL', soundEffects: { enter: { soundId: 's1', volume: 0.3 }, exit: { soundId: 's2' } } } as any], library);
    expect(oil.sounds).toEqual({ enter: { soundId: 's1', url: '/assets/sounds/splash.mp3', volume: 0.3, loop: false } });
  });

  it('leaves a fluid with no references alone', () => {
    const plain = { id: 'f1', typeKey: 'OIL' } as any;
    expect(attachFluidSounds([plain], library)[0]).toBe(plain);
  });

  it('is applied by the database loader', async () => {
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ fluids: [{ id: 'f1', typeKey: 'OIL', soundEffects: { burn: { soundId: 's1' } } }], sounds: library })
    );
    expect(defs.fluids?.[0].sounds?.burn).toMatchObject({ url: '/assets/sounds/splash.mp3', loop: true, volume: 1 });
  });
});

describe('mob sounds', () => {
  const library = [
    { id: 's1', url: '/assets/sounds/a.mp3', volume: 0.7, isActive: true },
    { id: 's2', url: '/assets/sounds/b.mp3', volume: 1, isActive: false },
  ];

  it('resolves stored sound references to playable urls', () => {
    const [mob] = attachMobSounds([{ id: 'm1', name: 'M', soundEffects: { attack: { soundId: 's1' }, death: { soundId: 's2' } } } as any], library);
    expect(mob.sounds).toEqual({ attack: { soundId: 's1', url: '/assets/sounds/a.mp3', volume: 1, loop: false } });
  });

  it('plays a sound at the volume set on this mob, whatever the library volume is', () => {
    const [a, b] = attachMobSounds(
      [
        { id: 'm1', name: 'A', soundEffects: { attack: { soundId: 's1', volume: 0.3 } } } as any,
        { id: 'm2', name: 'B', soundEffects: { attack: { soundId: 's1' } } } as any,
      ],
      library
    );
    expect(a.sounds?.attack?.volume).toBe(0.3);
    expect(b.sounds?.attack?.volume).toBe(1);
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

  it('reads the seed files', () => {
    write('items.json', [{ id: 'a' }]);
    write('mobs.json', []);
    write('blocks.json', [{ typeKey: 'DIRT' }]);
    expect(loadDefinitionsFromFiles(tmp)).toEqual({ items: [{ id: 'a' }], mobs: [], blocks: [{ typeKey: 'DIRT' }], fluids: [], gases: [], extractors: [], particleEffects: [], characterSounds: {} });
  });

  it('reads fluids.json when it exists', () => {
    write('items.json', []);
    write('fluids.json', [{ typeKey: 'OIL' }]);
    expect(loadDefinitionsFromFiles(tmp).fluids).toEqual([{ typeKey: 'OIL' }]);
    fs.rmSync(path.join(tmp, 'fluids.json'));
  });

  it('fails loudly on a missing file or non-array content', () => {
    write('items.json', {});
    expect(() => loadDefinitionsFromFiles(tmp)).toThrow(/array/);
    fs.rmSync(path.join(tmp, 'mobs.json'));
    write('items.json', []);
    expect(() => loadDefinitionsFromFiles(tmp)).toThrow();
  });
});

describe('character sounds', () => {
  const library = [
    { id: 's1', url: '/assets/sounds/ouch.mp3', volume: 0.6, isActive: true },
    { id: 's2', url: '/assets/sounds/off.mp3', volume: 1, isActive: false },
  ];

  it('resolves the stored slot references to playable urls in the database loader', async () => {
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ sounds: library, characterSounds: { id: 'default', soundEffects: { hurt: { soundId: 's1' }, jump: { soundId: 's2' } } } })
    );
    expect(defs.characterSounds).toEqual({ hurt: { soundId: 's1', url: '/assets/sounds/ouch.mp3', volume: 1, loop: false } });
  });

  it('uses the volume set on the character slot', async () => {
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ sounds: library, characterSounds: { id: 'default', soundEffects: { hurt: { soundId: 's1', volume: 0.4 } } } })
    );
    expect(defs.characterSounds?.hurt?.volume).toBe(0.4);
  });

  it('is empty when nothing is configured, or the sound was deleted', async () => {
    expect((await loadDefinitionsFromDatabase(fakePrisma({}))).characterSounds).toEqual({});
    const defs = await loadDefinitionsFromDatabase(
      fakePrisma({ characterSounds: { id: 'default', soundEffects: { hurt: { soundId: 'gone' } } } })
    );
    expect(defs.characterSounds).toEqual({});
  });

  it('is available from the installed definitions', async () => {
    await installDefinitionsFromDatabase(
      fakePrisma({ sounds: library, characterSounds: { id: 'default', soundEffects: { death: { soundId: 's1' } } } })
    );
    expect(MiningDataManager.getInstance().getCharacterSounds().death?.url).toBe('/assets/sounds/ouch.mp3');
    MiningDataManager.reset();
  });
});

describe('extractors', () => {
  const basic = { id: 'e1', key: 'basic_extractor', name: 'Basic', isDefault: true };

  it('loads the extractor table, oldest first', async () => {
    const prisma = fakePrisma({ extractors: [basic] });
    const defs = await loadDefinitionsFromDatabase(prisma);
    expect(defs.extractors).toEqual([basic]);
    expect(prisma.extractor.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
  });

  it('allows an empty table, and a database client without one', async () => {
    await expect(loadDefinitionsFromDatabase(fakePrisma({ extractors: [] }))).resolves.toMatchObject({ extractors: [] });
    const prisma = fakePrisma({});
    delete prisma.extractor;
    await expect(loadDefinitionsFromDatabase(prisma)).resolves.toMatchObject({ extractors: [] });
  });

  it('propagates database errors from the extractor table', async () => {
    const prisma = fakePrisma({});
    prisma.extractor.findMany.mockRejectedValue(new Error('no such table'));
    await expect(loadDefinitionsFromDatabase(prisma)).rejects.toThrow('no such table');
  });

  it('installs extractors for lookup by key or id; the first of a duplicated key wins', async () => {
    await installDefinitionsFromDatabase(fakePrisma({ extractors: [basic, { ...basic, id: 'e2', name: 'Copy' }, { id: 'e3', name: 'No key' }] }));
    const data = MiningDataManager.getInstance();
    expect(data.getExtractor('basic_extractor')?.name).toBe('Basic');
    expect(data.getExtractor('e1')?.name).toBe('Basic');
    expect(data.getExtractors()).toHaveLength(1);
    expect(data.getExtractor('nope')).toBeUndefined();
  });

  it('falls back to the built-in extractor when none are defined, and prefers the default one when they are', async () => {
    await installDefinitionsFromDatabase(fakePrisma({ extractors: [] }));
    expect(MiningDataManager.getInstance().getDefaultExtractor().key).toBe('basic_extractor');
    expect(MiningDataManager.getInstance().getExtractors()).toEqual([]);
    await installDefinitionsFromDatabase(fakePrisma({ extractors: [{ id: 'a', key: 'a', name: 'A' }, { id: 'b', key: 'b', name: 'B', isDefault: true }] }));
    expect(MiningDataManager.getInstance().getDefaultExtractor().id).toBe('b');
  });

  it('reads the dev seed mirror, which has the basic extractor', () => {
    const defs = loadDefinitionsFromFiles(path.resolve(__dirname, '../../../../../packages/shared/src/data'));
    expect(defs.extractors?.map((e) => e.key)).toEqual(['basic_extractor']);
    expect(defs.extractors?.flatMap((e) => validateExtractor(e))).toEqual([]);
  });

  it('resolves sound references to urls at the volume set on this extractor', async () => {
    const library = [{ id: 's1', url: '/assets/sounds/land.mp3', volume: 0.7, isActive: true }];
    const [extractor] = attachExtractorSounds([{ ...basic, soundEffects: { landing: { soundId: 's1', volume: 0.4 } } } as any], library);
    expect(extractor.sounds?.landing).toMatchObject({ url: '/assets/sounds/land.mp3', volume: 0.4 });
    const plain = { ...basic } as any;
    expect(attachExtractorSounds([plain], library)[0]).toBe(plain);
    const defs = await loadDefinitionsFromDatabase(fakePrisma({ extractors: [{ ...basic, soundEffects: { loop: { soundId: 's1' } } }], sounds: library }));
    expect(defs.extractors?.[0].sounds?.loop).toMatchObject({ url: '/assets/sounds/land.mp3', volume: 1 });
  });
});
