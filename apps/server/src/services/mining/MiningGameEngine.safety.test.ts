import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { isInBounds } from '../miningMap.service';
import { MINING_CONFIG } from '@mine-me/shared';
import { hitMob, hitPlayer } from './testHelpers';

const validInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  miningKey: false,
  sequence: 1,
};

describe('MiningGameEngine tick safety & input validation', () => {
  let socket: any;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  const makeEngine = (extra: Record<string, unknown> = {}) =>
    new MiningGameEngine({ characterId: 'char-1', cityId: 'city-1', seed: 12345, socket, ...extra });

  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  describe('isInBounds', () => {
    it('accepts integer tiles inside the grid', () => {
      expect(isInBounds(0, 0)).toBe(true);
      expect(isInBounds(MINING_CONFIG.GRID_WIDTH - 1, MINING_CONFIG.GRID_HEIGHT - 1)).toBe(true);
    });
    it('rejects out-of-range, non-integer and non-finite coordinates', () => {
      expect(isInBounds(-1, 0)).toBe(false);
      expect(isInBounds(MINING_CONFIG.GRID_WIDTH, 0)).toBe(false);
      expect(isInBounds(1.5, 3)).toBe(false);
      expect(isInBounds(3, 0.2)).toBe(false);
      expect(isInBounds(NaN, 0)).toBe(false);
      expect(isInBounds(Infinity, 0)).toBe(false);
    });
  });

  describe('handleInput', () => {
    it('keeps the previous valid input when the payload is malformed', () => {
      const engine = makeEngine();
      engine.handleInput('char-1', { ...validInput, right: true });
      engine.handleInput('char-1', { ...validInput, miningKey: true, miningTarget: { x: 1.5, y: 2 } } as any);
      engine.handleInput('char-1', { ...validInput, left: 'yes' } as any);
      engine.handleInput('char-1', null as any);
      expect(engine.players.get('char-1')!.inputs.right).toBe(true);
      expect(engine.players.get('char-1')!.inputs.miningKey).toBe(false);
    });

    it('does not crash the tick when a float mining target is sent', () => {
      const engine = makeEngine();
      engine.handleInput('char-1', { ...validInput, miningKey: true, miningTarget: { x: 1.5, y: 3 } } as any);
      expect(() => (engine as any).tick(1 / 30)).not.toThrow();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('ignores NaN aim directions', () => {
      const engine = makeEngine();
      engine.handleInput('char-1', { ...validInput, aimDirection: { x: NaN, y: 1 } } as any);
      expect(engine.players.get('char-1')!.aimDirection).toEqual({ x: 1, y: 0 });
    });

    it('normalises valid aim directions', () => {
      const engine = makeEngine();
      engine.handleInput('char-1', { ...validInput, aimDirection: { x: 0, y: 10 } });
      expect(engine.players.get('char-1')!.aimDirection).toEqual({ x: 0, y: 1 });
    });
  });

  describe('tick isolation', () => {
    it('keeps running other steps and still broadcasts when one step throws', () => {
      const engine = makeEngine();
      vi.spyOn(engine.mobSubsystem, 'updateActiveMobs').mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => (engine as any).tick(1 / 30)).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('step "mobs" failed'), expect.any(Error));
      expect(socket.emit).toHaveBeenCalledWith('mining_state_tick', expect.anything());
    });

    it('resets the failure counter after a clean tick', () => {
      const engine = makeEngine();
      const onFatalError = vi.fn();
      (engine as any).onFatalError = onFatalError;
      const spy = vi.spyOn(engine.mobSubsystem, 'updateActiveMobs');
      spy.mockImplementation(() => {
        throw new Error('boom');
      });
      for (let i = 0; i < MiningGameEngine.MAX_CONSECUTIVE_FAILED_TICKS - 1; i++) (engine as any).tick(1 / 30);
      spy.mockImplementation(() => {});
      (engine as any).tick(1 / 30);
      spy.mockImplementation(() => {
        throw new Error('boom');
      });
      for (let i = 0; i < MiningGameEngine.MAX_CONSECUTIVE_FAILED_TICKS - 1; i++) (engine as any).tick(1 / 30);
      expect(onFatalError).not.toHaveBeenCalled();
    });

    it('ends only this room after too many consecutive failing ticks', () => {
      const onFatalError = vi.fn();
      const engine = makeEngine({ onFatalError, roomId: 'room-x' });
      vi.spyOn(engine.mobSubsystem, 'updateActiveMobs').mockImplementation(() => {
        throw new Error('boom');
      });
      for (let i = 0; i < MiningGameEngine.MAX_CONSECUTIVE_FAILED_TICKS; i++) (engine as any).tick(1 / 30);
      expect(onFatalError).toHaveBeenCalledTimes(1);
      expect(onFatalError).toHaveBeenCalledWith('room-x');
      expect(socket.emit).toHaveBeenCalledWith('mining_session_timeout', expect.objectContaining({
        message: expect.stringContaining('collapsed'),
      }));
      // Stopped: further ticks are no-ops
      const emits = socket.emit.mock.calls.length;
      (engine as any).tick(1 / 30);
      expect(socket.emit.mock.calls.length).toBe(emits);
    });
  });

  describe('empty entity lists', () => {
    const lastTick = () => socket.emit.mock.calls.filter((c: any[]) => c[0] === 'mining_state_tick').at(-1)![1];

    it('sends empty arrays for mobs and otherPlayers so clients can clear them', () => {
      const engine = makeEngine({ mapConfig: { mobSpawnCount: 0 } });
      for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
      (engine as any).tick(1 / 30);
      const payload = lastTick();
      expect(payload.mobs).toEqual([]);
      expect(payload.otherPlayers).toEqual([]);
    });

    it('the tick after the last mob dies reports an empty mob list (not undefined)', () => {
      const engine = makeEngine({ mapConfig: { mobSpawnCount: 0 } });
      for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
      const mob = engine.spawnMob({ id: 'm', health: 10 }, { x: 10, y: 10 });
      (engine as any).tick(1 / 30);
      expect(lastTick().mobs).toHaveLength(1);

      hitMob(engine, mob.id, 999);
      (engine as any).tick(1 / 30);
      // First the dying mob (so clients can animate it)...
      expect(lastTick().mobs).toEqual([expect.objectContaining({ id: mob.id, health: 0, animationState: 'death' })]);

      // ...then, once it has finished dying, an explicit empty list
      for (let i = 0; i < Math.ceil(MINING_CONFIG.MOB_DEATH_LINGER_SECONDS * 30) + 2; i++) (engine as any).tick(1 / 30);
      expect(lastTick().mobs).toEqual([]);
    });
  });
});
