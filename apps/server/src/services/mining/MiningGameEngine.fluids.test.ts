import { describe, it, expect, beforeEach } from 'vitest';
import { MiningTileType, MINING_CONFIG } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('fluids in a mining room', () => {
  const cid = 'fluid-char';
  let engine: MiningGameEngine;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const oilAt = (x: number, y: number) => engine.fluidSubsystem.grid.getLevel(x, y);
  const setTile = (x: number, y: number, type: number) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed: true };
  };

  /** A sealed pocket: x 10..14 open at y 20..22, solid all around. */
  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 18; y <= 24; y++) {
      for (let x = 8; x <= 16; x++) {
        const open = x >= 10 && x <= 14 && y >= 20 && y <= 22;
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT);
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 5.5, y: 5.5 };
  });

  it('knows the fluids from the definitions', () => {
    expect(engine.fluidSubsystem.registry.idOf('OIL')).toBeGreaterThan(0);
    expect(engine.fluidSubsystem.placeFluid(12, 20, 'OIL')).toBe(true);
    expect(engine.fluidSubsystem.placeFluid(12, 20, 'NOPE')).toBe(false);
    expect(engine.fluidSubsystem.placeFluid(9, 20, 'OIL')).toBe(false); // solid dirt
  });

  it('flows only on every Nth tick', () => {
    engine.fluidSubsystem.placeFluid(12, 20, 'OIL');
    const start = (engine as any).tickCount as number;
    const stepsBefore = oilAt(12, 21);
    tick(MINING_CONFIG.FLUID_STEP_TICKS - 1 - (start % MINING_CONFIG.FLUID_STEP_TICKS));
    expect(oilAt(12, 21)).toBe(stepsBefore);
    tick(MINING_CONFIG.FLUID_STEP_TICKS);
    expect(oilAt(12, 21)).toBeGreaterThan(0);
  });

  it('settles on the floor of the pocket and stops costing anything', () => {
    engine.fluidSubsystem.placeFluid(12, 20, 'OIL');
    tick(600);
    expect(oilAt(12, 22)).toBeGreaterThan(0.1);
    expect(engine.fluidSubsystem.grid.activeCount).toBe(0);
  });

  it('flows into a hole when a wall is mined out', () => {
    for (let x = 10; x <= 14; x++) engine.fluidSubsystem.placeFluid(x, 22, 'OIL', 0.6);
    tick(300);
    expect(oilAt(16, 22)).toBe(0);
    // Open the wall on the right and a pocket behind it, the way mining does (grid, then tile update)
    setTile(15, 22, MiningTileType.EMPTY);
    setTile(16, 22, MiningTileType.EMPTY);
    (engine as any).buildWorld().pushTileUpdate({ x: 15, y: 22, type: MiningTileType.EMPTY });
    expect(engine.fluidSubsystem.grid.activeCount).toBeGreaterThan(0);
    tick(600);
    expect(oilAt(15, 22)).toBeGreaterThan(0.1);
    expect(oilAt(16, 22)).toBeGreaterThan(0.1);
  });

  it('pushes oil out of a cell where a block is placed', () => {
    engine.fluidSubsystem.placeFluid(12, 21, 'OIL', 0.5);
    setTile(12, 21, MiningTileType.ROCK);
    (engine as any).buildWorld().pushTileUpdate({ x: 12, y: 21, type: MiningTileType.ROCK });
    expect(oilAt(12, 21)).toBe(0);
    expect(oilAt(12, 20)).toBeCloseTo(0.5, 5);
  });

  it('lets oil through non-solid tiles like ladders without removing them', () => {
    setTile(12, 22, MiningTileType.LADDER);
    engine.fluidSubsystem.placeFluid(12, 21, 'OIL', 1);
    tick(300);
    expect(engine.grid[22][12].type).toBe(MiningTileType.LADDER);
    expect(oilAt(12, 22)).toBeGreaterThan(0.1);
  });

  it('starts a room with the oil pockets the generator placed, sitting still inside solid walls', () => {
    const big = new MiningGameEngine({
      characterId: 'gen-char', cityId: 'c', seed: 5,
      mapConfig: { mobSpawnCount: 0, gridWidth: 80, gridHeight: 80 },
      socket: { connected: true, emit: () => {} } as any,
    });
    const grid = big.fluidSubsystem.grid;
    // Water lies in open pools that spread and thin out; oil and lava are sealed pockets
    const pocketVolume = () => ['OIL', 'LAVA'].reduce((sum, key) => sum + grid.totalVolume(big.fluidSubsystem.registry.idOf(key)!), 0);
    const volume = pocketVolume();
    expect(volume).toBeGreaterThan(4);
    for (let n = 0; n < 300; n++) (big as any).tick(1 / 30);
    // Sealed: none of it evaporated or moved out, and the pocket cells were never solid
    expect(pocketVolume()).toBeGreaterThan(volume - 0.5);
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        if (grid.getLevel(x, y) > 0) expect(big.grid[y][x].type).toBe(MiningTileType.EMPTY);
      }
    }
  });

  it('never spawns a mob inside an oil pocket', () => {
    const big = new MiningGameEngine({
      characterId: 'mob-char', cityId: 'c', seed: 5,
      mapConfig: { mobSpawnCount: 0, gridWidth: 80, gridHeight: 80 },
      socket: { connected: true, emit: () => {} } as any,
    });
    const grid = big.fluidSubsystem.grid;
    // Make the pocket cells the only open floor candidates by filling in every other cave
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (grid.getLevel(x, y) <= 0) big.grid[y][x] = { type: MiningTileType.DIRT, revealed: true };
    const pos = big.mobSubsystem.findValidCavernSpawnPosition(2);
    expect(grid.getLevel(Math.floor(pos.x), Math.floor(pos.y) - 1)).toBe(0);
  });
});

describe('fluids acting on bodies in a mining room', () => {
  const cid = 'body-char';
  let engine: MiningGameEngine;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const setTile = (x: number, y: number, type: number) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed: true };
    if (type === MiningTileType.EMPTY) engine.rigidWorld.removeTileCollider(x, y);
    else engine.rigidWorld.addTileCollider(x, y);
  };

  /** A sealed tank x 30..36, y 20..32 (floor at 33), filled with oil from y 26 down. */
  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 18; y <= 34; y++) {
      for (let x = 28; x <= 38; x++) {
        const open = x >= 30 && x <= 36 && y >= 20 && y <= 32;
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT);
      }
    }
    const fluids = engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) for (let x = 0; x < fluids.width; x++) fluids.setCell(x, y, 0, 0);
    for (let y = 26; y <= 32; y++) for (let x = 30; x <= 36; x++) engine.fluidSubsystem.placeFluid(x, y, 'OIL', 1);
    engine.players.get(cid)!.playerBody.position = { x: 33.5, y: 32 + 1 - 0.8 };
    engine.players.get(cid)!.playerBody.isGrounded = true;
  });

  it('slows the player wading in oil, and not out of it', () => {
    const me = engine.players.get(cid)!;
    engine.handleInput(cid, { ...me.inputs, right: true, sequence: me.inputs.sequence + 1 });
    tick(1);
    expect(me.playerBody.velocity.x).toBeGreaterThan(0);
    expect(me.playerBody.velocity.x).toBeLessThan(MINING_CONFIG.MOVE_SPEED * 0.6);
    expect(me.playerBody.fluidEnvironment).toBe(engine.fluidSubsystem.environment);
    expect(me.playerBody.movementFactor).toBeLessThan(0.6);

    me.playerBody.position = { x: 33.5, y: 21 - 0.8 }; // standing on air above the oil
    me.playerBody.isGrounded = false;
    tick(1);
    expect(me.playerBody.movementFactor).toBe(1);
  });

  it('floats a light dropped item to the oil surface and sinks a heavy one', () => {
    const light = engine.rigidWorld.createItemBody('light', { x: 31.5, y: 31 }, undefined, { density: 0.2 });
    const heavy = engine.rigidWorld.createItemBody('heavy', { x: 35.5, y: 27 }, undefined, { density: 4 });
    tick(150);
    expect(light.getPosition().y).toBeLessThan(28.5); // risen well above the floor (surface is at y=26)
    expect(heavy.getPosition().y).toBeGreaterThan(31.4); // on the floor
  });

  it('brakes a falling item in oil compared with the same drop in air', () => {
    const inOil = engine.rigidWorld.createItemBody('oil', { x: 31.5, y: 26.5 }, undefined, { density: 4 });
    const inAir = engine.rigidWorld.createItemBody('air', { x: 31.5, y: 21 }, undefined, { density: 4 });
    tick(10);
    expect(inOil.getPosition().y - 26.5).toBeLessThan(inAir.getPosition().y - 21);
  });

  it('slows a mob wading in oil, and not once it is out', () => {
    const mob = engine.spawnMob({ id: 'm', name: 'Wader' }, { x: 33.5, y: 33 });
    tick(2);
    expect(mob.mobBody.fluidEnvironment).toBe(engine.fluidSubsystem.environment);
    expect(mob.mobBody.movementFactor).toBeLessThan(0.7);
    mob.mobBody.position = { x: 33.5, y: 21 };
    mob.mobBody.isGrounded = false;
    tick(1);
    expect(mob.mobBody.movementFactor).toBe(1);
  });
});
