import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from '../MiningGameEngine';
import { hitPlayer } from '../testHelpers';
import { createDefaultSandboxLayout, SANDBOX_SKY_ROWS } from './SandboxLayout';

const SKY = SANDBOX_SKY_ROWS;

const cid = 'tools';
let engine: MiningGameEngine;
const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
const tools = () => engine.sandbox!;
const fluidAt = (x: number, y: number) => engine.fluidSubsystem.grid.getLevel(x, y);

beforeEach(() => {
  engine = new MiningGameEngine({
    characterId: cid, cityId: 'c', seed: 1, gameMode: 'sandbox', maxHealth: 100,
    socket: { connected: true, emit: vi.fn() } as any,
    mapConfig: { surfaceDummyMobId: 'mob_target_dummy' },
  });
});

describe('sandbox tools exist only in a sandbox', () => {
  it('are absent from the normal modes', () => {
    const solo = new MiningGameEngine({ characterId: 'x', cityId: 'c', seed: 1, socket: { connected: true, emit: vi.fn() } as any });
    expect(solo.sandbox).toBeNull();
    expect(tools()).toBeDefined();
  });
});

describe('pourFluid', () => {
  it('adds fluid to an open cell', () => {
    expect(tools().pourFluid(35, SKY - 3, 'OIL')).toEqual({ ok: true }); // in the open sky
    expect(fluidAt(35, SKY - 3)).toBeGreaterThan(0);
  });

  it('fills a tile up to one full cell and never past it, however often it is used', () => {
    expect(tools().setSim({ paused: true }).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(tools().pourFluid(35, SKY - 3, 'OIL')).toEqual({ ok: true });
    expect(fluidAt(35, SKY - 3)).toBeCloseTo(1, 6);
    engine.fluidSubsystem.grid.setCell(35, SKY - 3, engine.fluidSubsystem.registry.idOf('OIL')!, 0.4);
    tools().pourFluid(35, SKY - 3, 'OIL');
    expect(fluidAt(35, SKY - 3)).toBeCloseTo(1, 6); // topped up, not 1.4
    tools().setSim({ paused: false });
  });
  it.each([
    ['a solid tile', [10, SKY + 5, 'OIL'], /cannot hold/],
    ['an unknown fluid', [35, SKY, 'LAVA9'], /Unknown fluid/],
    ['a tile off the map', [90, SKY, 'OIL'], /inside the map/],
    ['a fractional tile', [35.5, SKY, 'OIL'], /inside the map/],
    ['a non-number', ['a', SKY, 'OIL'], /inside the map/],
    ['a missing fluid', [35, SKY, undefined], /Unknown fluid/],
  ])('refuses %s', (_name, [x, y, key], message) => {
    const res = tools().pourFluid(x, y, key);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(message as RegExp);
  });
});

describe('pouring in the sky', () => {
  it('lets fluid poured high above the ground fall and land on it', () => {
    expect(tools().pourFluid(20, 0, 'OIL')).toEqual({ ok: true }); // the very top row of the map
    tick(400);
    expect(fluidAt(20, 0)).toBe(0); // it has left the top
    // ...and rests on the ground (the row just above the surface), spreading along it
    let onGround = 0;
    for (let x = 0; x < 90; x++) onGround += fluidAt(x, SKY - 1);
    expect(onGround).toBeGreaterThan(0.5);
  });

  it('lets fluid poured above a pool fall into it', () => {
    const before = engine.fluidSubsystem.grid.totalVolume();
    tools().pourFluid(38, 2, 'OIL');
    tick(300);
    expect(engine.fluidSubsystem.grid.totalVolume()).toBeGreaterThan(before);
    expect(fluidAt(38, 2)).toBe(0);
  });
});

describe('spawnMob', () => {
  it('spawns any mob in open space', () => {
    const before = engine.getActiveMobs().length;
    const res = tools().spawnMob('Mole Person', 60.5, SKY + 13);
    expect(res.ok).toBe(true);
    expect(engine.getActiveMobs()).toHaveLength(before + 1);
  });
  it('refuses unknown mobs, solid spots and points off the map', () => {
    expect(tools().spawnMob('nobody', 60, SKY + 13)).toEqual({ ok: false, error: 'Unknown mob.' });
    expect(tools().spawnMob('Mole Person', 5, SKY + 5)).toEqual({ ok: false, error: 'That spot is inside a block.' });
    expect(tools().spawnMob('Mole Person', 200, SKY + 5).ok).toBe(false);
    expect(tools().spawnMob('Mole Person', NaN, SKY + 5).ok).toBe(false);
    expect(tools().spawnMob(5, 5, SKY + 5).ok).toBe(false);
  });
  it('lists the loaded mobs for the picker', () => {
    expect(tools().mobOptions().map((m) => m.name)).toContain('Mole Person');
  });
});

describe('spawning in the sky', () => {
  it('can place a mob high in the air', () => {
    expect(tools().spawnMob('Mole Person', 60.5, 2.5).ok).toBe(true);
  });
});

describe('god mode', () => {
  it('stops damage while on and restores it when off', () => {
    expect(tools().setGodMode(cid, true).ok).toBe(true);
    expect(hitPlayer(engine, cid, 30)).toBe(false);
    expect(engine.getPlayer(cid)!.health).toBe(100);
    expect(tools().status(cid).godMode).toBe(true);
    tools().setGodMode(cid, false);
    expect(hitPlayer(engine, cid, 30)).toBe(true);
    expect(engine.getPlayer(cid)!.health).toBe(70);
  });
  it('rejects a non-boolean and unknown players', () => {
    expect(tools().setGodMode(cid, 'yes').ok).toBe(false);
    expect(tools().setGodMode('ghost', true).ok).toBe(false);
  });
});

describe('simulation control', () => {
  // A cell of oil in the open air of the hall falls and spreads once the simulation steps
  const drop = () => tools().pourFluid(60, SKY + 13, 'OIL');

  it('freezes the flow while paused and resumes it', () => {
    expect(tools().setSim({ paused: true }).ok).toBe(true);
    drop();
    tick(120);
    expect(fluidAt(60, SKY + 13)).toBeGreaterThan(0);
    expect(tools().status(cid).paused).toBe(true);
    tools().setSim({ paused: false });
    tick(120);
    expect(fluidAt(60, SKY + 13)).toBe(0);
  });

  it('runs exactly one step per request while paused', () => {
    tools().setSim({ paused: true });
    drop();
    tick(60);
    expect(fluidAt(60, SKY + 14)).toBe(0); // nothing has flowed yet
    tools().setSim({ step: true });
    tick(1);
    const afterOne = fluidAt(60, SKY + 14);
    expect(afterOne).toBeGreaterThan(0); // exactly one step moved some down
    tick(60);
    expect(fluidAt(60, SKY + 14)).toBe(afterOne); // and no more without another request
  });

  it('does not stop the players while the flow is paused', () => {
    tools().setSim({ paused: true });
    const me = engine.getPlayer(cid)!;
    me.inputs = { ...me.inputs, right: true };
    const x = me.playerBody.position.x;
    tick(30);
    expect(me.playerBody.position.x).toBeGreaterThan(x);
  });

  it('only accepts the offered speeds', () => {
    expect(tools().setSim({ speed: 2 }).ok).toBe(true);
    expect(tools().status(cid).speed).toBe(2);
    expect(tools().setSim({ speed: 3 }).ok).toBe(false);
    expect(tools().setSim({ paused: 'no' }).ok).toBe(false);
    expect(tools().status(cid).speed).toBe(2);
  });

  it('runs faster at a higher speed', () => {
    const settled = (speed: number) => {
      const e = new MiningGameEngine({ characterId: 'f', cityId: 'c', seed: 1, gameMode: 'sandbox', socket: { connected: true, emit: vi.fn() } as any });
      e.sandbox!.setSim({ speed });
      e.sandbox!.pourFluid(60, SKY + 13, 'OIL');
      for (let i = 0; i < 12; i++) (e as any).tick(1 / 30);
      return e.fluidSubsystem.grid.getLevel(60, SKY + 13);
    };
    expect(settled(4)).toBeLessThanOrEqual(settled(0.25));
  });
});

describe('clearHazards', () => {
  it('removes all fluid, including the pools, and puts the fire out', () => {
    expect(engine.fluidSubsystem.grid.totalVolume()).toBeGreaterThan(0);
    tools().ignite(38, SKY + 5);
    expect(engine.fireSubsystem.grid.burningCount).toBeGreaterThan(0);
    tools().clearHazards();
    expect(engine.fluidSubsystem.grid.totalVolume()).toBe(0);
    expect(engine.fireSubsystem.grid.burningCount).toBe(0);
  });
});

describe('ignite', () => {
  it('sets fire to fluid that burns, and not twice', () => {
    expect(tools().ignite(38, SKY + 5)).toEqual({ ok: true });
    expect(engine.fireSubsystem.grid.isBurning(38, SKY + 5)).toBe(true);
    expect(tools().ignite(38, SKY + 5).ok).toBe(false);
  });

  it('refuses a cell with nothing to burn', () => {
    expect(tools().ignite(20, SKY)).toEqual({ ok: false, error: 'Nothing there can burn.' });
    expect(tools().ignite(-1, 0).ok).toBe(false);
    expect(tools().ignite('x', 0).ok).toBe(false);
  });
});

describe('reset', () => {
  it('rebuilds the map, fluid and mobs and sends players back to the start', () => {
    const me = engine.getPlayer(cid)!;
    // Wreck the world
    engine.grid[SKY + 12][30] = { type: MiningTileType.EMPTY, revealed: true };
    tools().pourFluid(35, 0, 'OIL');
    tools().spawnMob('Mole Person', 60.5, SKY + 13);
    tools().setGodMode(cid, true);
    tools().setSim({ paused: true, speed: 2 });
    me.temporaryBackpack.push({ itemId: 'i', itemName: 'Copper', quantity: 1, iconUrl: null });
    me.playerBody.position = { x: 70, y: SKY + 13 };
    me.health = 5;

    tools().reset();

    const fresh = createDefaultSandboxLayout([]);
    expect(engine.grid).toHaveLength(fresh.height + fresh.skyRows);
    expect(engine.grid[SKY + 12][30].type).toBe(MiningTileType.EMPTY); // hall is open at row 12...
    expect(engine.getActiveMobs()).toHaveLength(2);
    expect(fluidAt(35, 0)).toBe(0);
    expect(engine.getPlayer(cid)).toBe(me);
    expect(me.health).toBe(me.maxHealth);
    expect(me.temporaryBackpack).toEqual([]);
    expect(Math.round(me.playerBody.position.x)).toBe(22);
    expect(Math.round(me.playerBody.position.y)).toBe(SKY);
    expect(me.godMode).toBe(true); // a player's own setting survives
    expect(tools().status(cid).paused).toBe(false);
    expect(tools().status(cid).speed).toBe(1);
  });

  it('puts a block that was mined back', () => {
    const wall = { x: 31, y: SKY + 4 }; // a rock in the pool wall
    expect(engine.grid[wall.y][wall.x].type).toBe(MiningTileType.ROCK);
    engine.grid[wall.y][wall.x] = { type: MiningTileType.EMPTY, revealed: true };
    tools().reset();
    expect(engine.grid[wall.y][wall.x].type).toBe(MiningTileType.ROCK);
  });

  it('still simulates after a reset', () => {
    tools().reset();
    tools().pourFluid(60, SKY + 13, 'OIL');
    tick(120);
    expect(fluidAt(60, SKY + 13)).toBe(0);
    expect(engine.fluidSubsystem.grid.totalVolume()).toBeGreaterThan(0);
  });
});

const gasAt = (x: number, y: number) => engine.gasSubsystem.grid.getConcentration(x, y);

describe('releaseGas', () => {
  it('adds gas to an open cell, up to a full cell', () => {
    expect(tools().releaseGas(35, SKY - 3, 'HYDROGEN')).toEqual({ ok: true });
    expect(gasAt(35, SKY - 3)).toBeGreaterThan(0);
    expect(tools().releaseGas(35, SKY - 3, 'HYDROGEN')).toMatchObject({ ok: false }); // already full
  });

  it.each([
    ['a solid tile', [10, SKY + 5, 'HYDROGEN'], /cannot hold/],
    ['an unknown gas', [35, SKY, 'NOPE9'], /Unknown gas/],
    ['a tile off the map', [90, SKY, 'HYDROGEN'], /inside the map/],
    ['a fractional tile', [35.5, SKY, 'HYDROGEN'], /inside the map/],
    ['a non-number', ['a', SKY, 'HYDROGEN'], /inside the map/],
    ['a missing gas', [35, SKY, undefined], /Unknown gas/],
    ['a cell holding another gas', [64, SKY + 4, 'NITROGEN'], /cannot hold/],
  ])('refuses %s', (_name, [x, y, key], message) => {
    const res = tools().releaseGas(x, y, key);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(message as RegExp);
  });

  it('refuses a cell that holds fluid: fluid wins the cell', () => {
    tools().pourFluid(35, SKY - 3, 'OIL');
    expect(tools().releaseGas(35, SKY - 3, 'HYDROGEN')).toMatchObject({ ok: false });
  });

  it('lets hydrogen released in the open sky rise and fade away', () => {
    tools().releaseGas(5, SKY - 2, 'HYDROGEN');
    tick(60);
    // Hydrogen is going up (and out): there is some above where it was let go
    let hydrogenHigh = 0;
    for (let y = 0; y < SKY - 2; y++) for (let x = 0; x < 90; x++) hydrogenHigh += gasAt(x, y) * (x >= 3 && x <= 7 ? 1 : 0);
    expect(hydrogenHigh + engine.gasSubsystem.grid.ventedVolume).toBeGreaterThan(0.2);
    tick(900);
    expect(engine.gasSubsystem.grid.totalVolume(engine.gasSubsystem.registry.idOf('HYDROGEN')!) - startingHydrogen()).toBeLessThan(0.5);
  });
});

/** Hydrogen already in the sealed chamber (it never leaves while the roof is on). */
const startingHydrogen = () => 48;

describe('the sandbox start', () => {
  it('begins with sealed hydrogen and nitrogen chambers that sit still', () => {
    const hydrogen = engine.gasSubsystem.registry.idOf('HYDROGEN')!;
    const nitrogen = engine.gasSubsystem.registry.idOf('NITROGEN')!;
    expect(engine.gasSubsystem.grid.totalVolume(hydrogen)).toBeCloseTo(48, 3);
    expect(engine.gasSubsystem.grid.totalVolume(nitrogen)).toBeCloseTo(48, 3);
    tick(300);
    expect(engine.gasSubsystem.grid.ventedVolume).toBe(0);
    expect(engine.gasSubsystem.grid.totalVolume(hydrogen)).toBeCloseTo(48, 1);
  });

  it('lets hydrogen out when the roof is mined through, and it rises out and fades', () => {
    const grid = engine.gasSubsystem.grid;
    const hydrogen = engine.gasSubsystem.registry.idOf('HYDROGEN')!;
    for (const y of [SKY, SKY + 1]) {
      engine.grid[y][63] = { type: MiningTileType.EMPTY, revealed: true };
      (engine as any).buildWorld().pushTileUpdate({ x: 63, y, type: MiningTileType.EMPTY });
    }
    expect(grid.isOpenToSky(63, SKY + 5)).toBe(true);
    tick(1500);
    expect(grid.ventedVolume).toBeGreaterThan(10);
    expect(grid.totalVolume(hydrogen)).toBeLessThan(48);
    // The nitrogen chamber next door is untouched
    expect(grid.totalVolume(engine.gasSubsystem.registry.idOf('NITROGEN')!)).toBeCloseTo(48, 1);
  });
});

describe('igniting gas', () => {
  it('sets off hydrogen as an explosion, with no dice, and the front crosses the chamber', () => {
    expect(tools().ignite(63, SKY + 4)).toEqual({ ok: true });
    expect(engine.gasExplosionSubsystem.pendingCount).toBe(1);
    expect(engine.fireSubsystem.grid.burningCount).toBe(0);
    tick(60);
    // Nearly all of it went up; only a thin cloud (too thin to burn) is left
    expect(engine.gasSubsystem.grid.totalVolume(engine.gasSubsystem.registry.idOf('HYDROGEN')!)).toBeLessThan(12);
    expect(engine.gasExplosionSubsystem.pendingCount).toBe(0);
  });

  it('cannot light nitrogen or clear air, and still lights oil as before', () => {
    expect(tools().ignite(73, SKY + 4)).toEqual({ ok: false, error: 'Nothing there can burn.' });
    expect(tools().ignite(5, SKY - 3)).toEqual({ ok: false, error: 'Nothing there can burn.' });
    tools().pourFluid(35, SKY + 3, 'OIL');
    expect(tools().ignite(35, SKY + 3)).toEqual({ ok: true });
  });
});

describe('clearing hazards removes gas too', () => {
  it('empties every chamber and every cloud', () => {
    tools().releaseGas(5, SKY - 2, 'HYDROGEN');
    tools().clearHazards();
    expect(engine.gasSubsystem.grid.totalVolume()).toBe(0);
  });
});

describe('the simulation control also governs gas', () => {
  it('a paused sandbox holds gas still, a single step moves it, and a reset restores the chambers', () => {
    tools().releaseGas(5, SKY - 2, 'HYDROGEN');
    tools().setSim({ paused: true });
    tick(60);
    expect(gasAt(5, SKY - 3)).toBe(0);
    tools().setSim({ step: true });
    tick(1);
    expect(gasAt(5, SKY - 3)).toBeGreaterThan(0);
    tools().clearHazards();
    tools().reset();
    expect(engine.gasSubsystem.grid.totalVolume(engine.gasSubsystem.registry.idOf('HYDROGEN')!)).toBeCloseTo(48, 3);
    expect(engine.gasSubsystem.grid.getConcentration(5, SKY - 2)).toBe(0);
  });
});
