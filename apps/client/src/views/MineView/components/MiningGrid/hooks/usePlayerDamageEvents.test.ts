import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MiningPlayerDamagedEvent } from '@mine-me/shared';
import { applyPlayerDamage, usePlayerDamageEvents } from './usePlayerDamageEvents';

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
