import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MiningPlayerDamagedEvent } from '@mine-me/shared';
import { applyPlayerDamage, usePlayerDamageEvents, showPlayerDamageNumber, PLAYER_DAMAGE_COLOR } from './usePlayerDamageEvents';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const event = (over: Partial<MiningPlayerDamagedEvent> = {}): MiningPlayerDamagedEvent => ({
  damage: 10, health: 90, maxHealth: 100,
  knockback: { x: -5, y: -4 }, knockbackSeconds: 0.2, invulnerableSeconds: 0.5, tick: 42,
  ...over,
});

describe('applyPlayerDamage', () => {
  it('launches the predicted body with the server impulse', () => {
    const body: any = { applyKnockback: vi.fn() };
    applyPlayerDamage(body, event());
    expect(body.applyKnockback).toHaveBeenCalledWith(-5, -4, 0.2);
  });

  it('routes the push through the predictor, with the server tick, when there is one', () => {
    const body: any = { applyKnockback: vi.fn() };
    const predictor: any = { applyKnockback: vi.fn() };
    applyPlayerDamage(body, event(), predictor);
    expect(predictor.applyKnockback).toHaveBeenCalledWith(-5, -4, 0.2, 42);
    expect(body.applyKnockback).not.toHaveBeenCalled(); // the predictor applies it to the body itself
  });

  it('does nothing for hits without knockback (e.g. the killing blow) or without a body', () => {
    const body: any = { applyKnockback: vi.fn() };
    applyPlayerDamage(body, event({ knockback: { x: 0, y: 0 }, knockbackSeconds: 0 }));
    expect(body.applyKnockback).not.toHaveBeenCalled();
    expect(() => applyPlayerDamage(null, event())).not.toThrow();
  });
});

describe('usePlayerDamageEvents', () => {
  it('subscribes to player_damaged, applies knockback, and unsubscribes on unmount', () => {
    const body: any = { applyKnockback: vi.fn() };
    const off = vi.fn();
    let handler: ((e: MiningPlayerDamagedEvent) => void) | undefined;
    const onEvent = vi.fn((_name: string, h: any) => { handler = h; return off; });

    const { unmount } = renderHook(() => usePlayerDamageEvents({ onEvent: onEvent as any, playerBodyRef: { current: body } }));
    expect(onEvent).toHaveBeenCalledWith('player_damaged', expect.any(Function));

    handler!(event());
    expect(body.applyKnockback).toHaveBeenCalledTimes(1);

    unmount();
    expect(off).toHaveBeenCalled();
  });
});

describe('showPlayerDamageNumber', () => {
  const body: any = { position: { x: 10, y: 20 } };

  it('spawns one floating damage number above the player, in pixels', () => {
    const manager: any = { spawnDamage: vi.fn() };
    showPlayerDamageNumber(manager, body, event({ damage: 17 }));
    expect(manager.spawnDamage).toHaveBeenCalledTimes(1);
    expect(manager.spawnDamage).toHaveBeenCalledWith(10 * TILE_SIZE, (20 - 0.7) * TILE_SIZE, 17, { color: PLAYER_DAMAGE_COLOR });
  });

  it('shows nothing for zero, negative or invalid damage', () => {
    const manager: any = { spawnDamage: vi.fn() };
    for (const damage of [0, -3, NaN, Infinity]) showPlayerDamageNumber(manager, body, event({ damage }));
    expect(manager.spawnDamage).not.toHaveBeenCalled();
  });

  it('does not throw without a manager or a body', () => {
    const manager: any = { spawnDamage: vi.fn() };
    expect(() => showPlayerDamageNumber(null, body, event())).not.toThrow();
    expect(() => showPlayerDamageNumber(undefined, body, event())).not.toThrow();
    expect(() => showPlayerDamageNumber(manager, null, event())).not.toThrow();
    expect(manager.spawnDamage).not.toHaveBeenCalled();
  });
});

describe('usePlayerDamageEvents floating numbers', () => {
  const setup = (managerRef?: any) => {
    let handler: ((e: MiningPlayerDamagedEvent) => void) | undefined;
    const onEvent = vi.fn((_n: string, h: any) => { handler = h; return vi.fn(); });
    const body: any = { position: { x: 3, y: 4 }, applyKnockback: vi.fn() };
    renderHook(() => usePlayerDamageEvents({
      onEvent: onEvent as any, playerBodyRef: { current: body }, floatingTextManagerRef: managerRef,
    }));
    return { fire: (e: MiningPlayerDamagedEvent) => handler!(e) };
  };

  it('shows a number for every damage event, whatever the source', () => {
    const manager: any = { spawnDamage: vi.fn() };
    const { fire } = setup({ current: manager });
    fire(event({ damage: 5, sourceName: 'Fall' }));
    fire(event({ damage: 30, sourceName: 'Falling rock' }));
    fire(event({ damage: 8, sourceName: 'Mole' }));
    expect(manager.spawnDamage.mock.calls.map((c: any[]) => c[2])).toEqual([5, 30, 8]);
  });

  it('still applies knockback when no manager is available', () => {
    const { fire } = setup(undefined);
    expect(() => fire(event())).not.toThrow();
  });

  it('reads the manager lazily, so one created after the hook mounted is used', () => {
    const ref: any = { current: null };
    const { fire } = setup(ref);
    ref.current = { spawnDamage: vi.fn() };
    fire(event({ damage: 9 }));
    expect(ref.current.spawnDamage).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerDamageEvents character sounds', () => {
  const setup = (sounds: any) => {
    let handler: ((e: MiningPlayerDamagedEvent) => void) | undefined;
    const onEvent = vi.fn((_n: string, h: any) => { handler = h; return vi.fn(); });
    const body: any = { position: { x: 3, y: 4 }, applyKnockback: vi.fn() };
    renderHook(() => usePlayerDamageEvents({
      onEvent: onEvent as any, playerBodyRef: { current: body }, characterSoundsRef: { current: sounds },
    }));
    return { fire: (e: MiningPlayerDamagedEvent) => handler!(e) };
  };

  it('plays the hurt sound with the health left after the hit', () => {
    const sounds: any = { onDamaged: vi.fn() };
    const { fire } = setup(sounds);
    fire(event({ damage: 10, health: 90 }));
    expect(sounds.onDamaged).toHaveBeenCalledWith(90);
  });

  it('reports the killing blow (0 health) so the death sound plays instead', () => {
    const sounds: any = { onDamaged: vi.fn() };
    const { fire } = setup(sounds);
    fire(event({ damage: 100, health: 0, knockback: { x: 0, y: 0 }, knockbackSeconds: 0 }));
    expect(sounds.onDamaged).toHaveBeenCalledWith(0);
  });

  it('makes no sound for a hit that did no damage', () => {
    const sounds: any = { onDamaged: vi.fn() };
    const { fire } = setup(sounds);
    fire(event({ damage: 0 }));
    expect(sounds.onDamaged).not.toHaveBeenCalled();
  });
});
