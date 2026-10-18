import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType, MINING_CONFIG, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('splashes when bodies cross a fluid surface', () => {
  const cid = 'splash-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const seconds = (s: number) => tick(Math.round(s * 30));
  const splashes = () => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').flatMap((c) => (c[1] as MiningStateTickPayload).fluidSplashes ?? []);
  const DRY_Y = 27 - 0.8; // standing on the ledge
  const standAt = (x: number, y: number) => { me().playerBody.position = { x, y }; me().playerBody.velocity = { x: 0, y: 0 }; me().playerBody.isGrounded = true; };

  /** A tank x 30..36 (floor at row 33) holding oil in rows 30..32 (about 3 deep). */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    for (let y = 22; y <= 34; y++) {
      for (let x = 28; x <= 38; x++) {
        const open = x >= 30 && x <= 36 && y >= 22 && y <= 32;
        engine.grid[y][x] = { type: open ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
      }
    }
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 36; x++) engine.fluidSubsystem.placeFluid(x, y, 'OIL', 1);
    // A ledge above the oil to stand on, so the player stays dry until the test moves them
    engine.grid[27][33] = { type: MiningTileType.DIRT, revealed: true };
    engine.rigidWorld.addTileCollider(33, 27);
    standAt(33.5, DRY_Y);
  });

  it('does nothing while the player is dry', () => {
    seconds(1);
    expect(splashes()).toEqual([]);
  });

  it('tells clients when a player wades in, at where they are, with the fluid\'s cell id', () => {
    standAt(33.5, 31.2);
    tick(1);
    const [event, ...rest] = splashes();
    expect(rest).toEqual([]);
    expect(event).toMatchObject({ kind: 'enter', fluidId: engine.fluidSubsystem.registry.idOf('OIL'), x: 33.5 });
    expect(event.y).toBeCloseTo(31.2, 0);
  });

  it('tells clients when they climb out again', () => {
    standAt(33.5, 31.2);
    tick(1);
    seconds(MINING_CONFIG.FLUID_SPLASH_COOLDOWN_SECONDS + 0.2);
    standAt(33.5, DRY_Y);
    tick(1);
    expect(splashes().map((s) => s.kind)).toEqual(['enter', 'exit']);
  });

  it('does not splash again while the player stays in', () => {
    standAt(33.5, 31.2);
    seconds(2);
    expect(splashes().filter((s) => s.kind === 'enter')).toHaveLength(1);
  });

  it('keeps quiet when the player bobs at the surface quicker than the cooldown', () => {
    standAt(33.5, 31.2);
    tick(1);
    standAt(33.5, DRY_Y);
    tick(1);
    standAt(33.5, 31.2);
    tick(1);
    standAt(33.5, DRY_Y);
    tick(1);
    // enter, then the exit is held back by the cooldown, so the surface does not machine-gun splashes
    expect(splashes().length).toBeLessThan(4);
    expect(splashes()[0].kind).toBe('enter');
  });

  it('a mob wading in is heard too', () => {
    const mob = engine.spawnMob({ id: 'm', name: 'Wader', aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 33.5, y: DRY_Y });
    mob.mobBody.position = { x: 33.5, y: 31.2 };
    tick(1);
    expect(splashes().filter((s) => s.kind === 'enter')).toHaveLength(1);
  });

  it('only players close enough to hear get the event', () => {
    standAt(33.5, 130.5); // well below the tank: outside the interest box (far away is a matter of depth)
    const mob = engine.spawnMob({ id: 'm', name: 'Wader', aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 33.5, y: DRY_Y });
    mob.mobBody.position = { x: 33.5, y: 31.2 };
    tick(1);
    expect(splashes()).toEqual([]); // a long way from the player
  });

  it('forgets a body that is gone, so a new one in the same place splashes', () => {
    const mob = engine.spawnMob({ id: 'm', name: 'Wader', aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 33.5, y: DRY_Y });
    mob.mobBody.position = { x: 33.5, y: 31.2 };
    standAt(33.5, DRY_Y);
    tick(1);
    engine.activeMobs.delete(mob.id);
    tick(1);
    expect((engine.fluidSubsystem as any).bodyFluid.size).toBe(0);
  });
});
