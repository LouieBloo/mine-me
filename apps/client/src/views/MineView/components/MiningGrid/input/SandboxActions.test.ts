import { describe, it, expect, vi } from 'vitest';
import { MiningTileType, MouseActionTriggerMode, type MiningClientTile } from '@mine-me/shared';
import { FreeCameraAction, HitDoodadAction, IgniteAction, PlaceDoodadAction, PourFluidAction, ReleaseGasAction, RemoveDoodadAction, SpawnMobAction } from './SandboxActions';

/** 6 wide, 4 tall: sky is outside (y < 0), open row 0-1, dirt below. */
const grid = (): MiningClientTile[][] =>
  Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 6 }, () => ({ type: y >= 2 ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true, damageStage: 0 })),
  );
const player = { x: 1, y: 1 };

describe('ReleaseGasAction', () => {
  it('releases into open tiles anywhere (no reach limit) and not into solid ones or off the map', () => {
    const action = new ReleaseGasAction('HYDROGEN', vi.fn());
    expect(action.canExecute({ x: 5, y: 0 }, player, grid())).toBe(true);
    expect(action.canExecute({ x: 2, y: 2 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 6, y: 0 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 0, y: -1 }, player, grid())).toBe(false);
  });

  it('holds to keep releasing, and sends the tile', async () => {
    const onRelease = vi.fn().mockResolvedValue(true);
    const action = new ReleaseGasAction('HYDROGEN', onRelease);
    expect(action.triggerMode).toBe(MouseActionTriggerMode.HOLD);
    expect(action.gasKey).toBe('HYDROGEN');
    await action.execute({ x: 3, y: 1 });
    expect(onRelease).toHaveBeenCalledWith({ x: 3, y: 1 });
  });

  it('shows a red reticle where it cannot release', () => {
    const action = new ReleaseGasAction('HYDROGEN', vi.fn());
    expect(action.getReticleStyle({ x: 1, y: 0 }, player, grid()).isValid).toBe(true);
    expect(action.getReticleStyle({ x: 1, y: 3 }, player, grid()).isValid).toBe(false);
  });
});

describe('PourFluidAction', () => {
  it('pours into open tiles anywhere (no reach limit) and not into solid ones or off the map', () => {
    const action = new PourFluidAction('OIL', vi.fn());
    expect(action.canExecute({ x: 5, y: 0 }, player, grid())).toBe(true);
    expect(action.canExecute({ x: 2, y: 2 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 6, y: 0 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 0, y: -1 }, player, grid())).toBe(false);
  });

  it('holds to keep pouring, and sends the tile', async () => {
    const onPour = vi.fn().mockResolvedValue(true);
    const action = new PourFluidAction('OIL', onPour);
    expect(action.triggerMode).toBe(MouseActionTriggerMode.HOLD);
    expect(action.fluidKey).toBe('OIL');
    await action.execute({ x: 3, y: 1 });
    expect(onPour).toHaveBeenCalledWith({ x: 3, y: 1 });
  });

  it('shows a red reticle where it cannot pour', () => {
    const action = new PourFluidAction('OIL', vi.fn());
    expect(action.getReticleStyle({ x: 1, y: 0 }, player, grid()).isValid).toBe(true);
    expect(action.getReticleStyle({ x: 1, y: 3 }, player, grid()).isValid).toBe(false);
  });
});

describe('SpawnMobAction', () => {
  it('spawns in open air at an exact point, including the sky above the surface', () => {
    const action = new SpawnMobAction('mob-1', vi.fn());
    expect(action.isContinuous).toBe(true);
    expect(action.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
    expect(action.canExecute({ x: 2.5, y: 0.5 }, player, grid())).toBe(true);
    expect(action.canExecute({ x: 2.5, y: -3 }, player, grid())).toBe(true);
    expect(action.canExecute({ x: 2.5, y: 2.5 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 9.5, y: 0.5 }, player, grid())).toBe(false);
    expect(action.canExecute({ x: 9.5, y: -3 }, player, grid())).toBe(false);
  });

  it('sends the point', async () => {
    const onSpawn = vi.fn().mockResolvedValue(true);
    await new SpawnMobAction('mob-1', onSpawn).execute({ x: 2.25, y: 0.75 });
    expect(onSpawn).toHaveBeenCalledWith({ x: 2.25, y: 0.75 });
  });
});

describe('IgniteAction', () => {
  it('can target any tile on the map', async () => {
    const onIgnite = vi.fn().mockResolvedValue(true);
    const action = new IgniteAction(onIgnite);
    expect(action.canExecute({ x: 4, y: 3 }, player, grid())).toBe(true);
    expect(action.canExecute({ x: 4, y: 4 }, player, grid())).toBe(false);
    await action.execute({ x: 4, y: 3 });
    expect(onIgnite).toHaveBeenCalledWith({ x: 4, y: 3 });
  });
});

describe('FreeCameraAction', () => {
  it('never does anything, so clicking does not mine or shoot', () => {
    const action = new FreeCameraAction();
    expect(action.canExecute()).toBe(false);
    expect(action.execute()).toBe(false);
    expect(action.getReticleStyle().isValid).toBe(false);
  });
});

describe('PlaceDoodadAction and RemoveDoodadAction', () => {
  it('click once on any tile of the map (the server decides whether the doodad fits), and send the tile', async () => {
    const onPlace = vi.fn().mockResolvedValue(true);
    const place = new PlaceDoodadAction('d1', onPlace);
    expect(place.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
    expect(place.doodadId).toBe('d1');
    expect(place.canExecute({ x: 2, y: 2 }, player, grid())).toBe(true);
    expect(place.canExecute({ x: 6, y: 0 }, player, grid())).toBe(false);
    await place.execute({ x: 3, y: 1 });
    expect(onPlace).toHaveBeenCalledWith({ x: 3, y: 1 });
    expect(place.getReticleStyle({ x: 1, y: 0 }, player, grid()).isValid).toBe(true);
    expect(place.getReticleStyle({ x: 9, y: 0 }, player, grid()).isValid).toBe(false);
  });

  it('removes the doodad under the cursor', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    const remove = new RemoveDoodadAction(onRemove);
    expect(remove.canExecute({ x: 0, y: 3 }, player, grid())).toBe(true);
    expect(remove.canExecute({ x: 0, y: 4 }, player, grid())).toBe(false);
    await remove.execute({ x: 4, y: 1 });
    expect(onRemove).toHaveBeenCalledWith({ x: 4, y: 1 });
  });

  it('hits the doodad under the cursor (ticket 143)', async () => {
    const onHit = vi.fn().mockResolvedValue(true);
    const hitDoodad = new HitDoodadAction(onHit);
    expect(hitDoodad.triggerMode).toBe(MouseActionTriggerMode.SINGLE);
    expect(hitDoodad.canExecute({ x: 0, y: 3 }, player, grid())).toBe(true);
    expect(hitDoodad.canExecute({ x: 0, y: 4 }, player, grid())).toBe(false);
    await hitDoodad.execute({ x: 4, y: 1 });
    expect(onHit).toHaveBeenCalledWith({ x: 4, y: 1 });
    expect(hitDoodad.getReticleStyle({ x: 1, y: 0 }, player, grid()).isValid).toBe(true);
  });
});
