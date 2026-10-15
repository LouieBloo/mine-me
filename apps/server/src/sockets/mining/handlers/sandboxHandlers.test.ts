import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../../../services/inventory.service', () => ({ InventoryService: { giveItemsToCharacter: vi.fn() } }));

import { SANDBOX_SKY_ROWS as SKY } from '../../../services/mining/sandbox/SandboxLayout';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import {
  handleSandboxPourFluid,
  handleSandboxReleaseGas,
  handleSandboxSpawnMob,
  handleSandboxIgnite,
  handleSandboxClearHazards,
  handleSandboxSetGodMode,
  handleSandboxSetSim,
  handleSandboxReset,
} from './sandboxHandlers';

const socketFor = (characterId: string | undefined) => ({ data: { characterId }, connected: true, emit: vi.fn() }) as any;
const join = (id: string, mode: 'sandbox' | 'singleplayer', socket = socketFor(id)) =>
  miningSessionManager.createSession(id, 'city', socket, true, 0, mode, id, undefined, undefined, {}, null, 100);
const io = {} as any;

describe('sandbox handlers', () => {
  afterEach(() => {
    for (const id of ['hs-a', 'hs-b', 'hs-solo']) miningSessionManager.cancelSession(id, { persistHealth: false });
  });

  describe('outside a sandbox', () => {
    beforeEach(() => {
      join('hs-solo', 'singleplayer');
    });

    it('refuses every command in a normal mine', async () => {
      const socket = socketFor('hs-solo');
      const results = await Promise.all([
        handleSandboxPourFluid(io, socket, { x: 1, y: 1, fluidKey: 'OIL' }),
        handleSandboxReleaseGas(io, socket, { x: 1, y: 1, gasKey: 'HYDROGEN' }),
        handleSandboxSpawnMob(io, socket, { mobId: 'Mole Person', x: 1, y: 1 }),
        handleSandboxIgnite(io, socket, { x: 1, y: 1 }),
        handleSandboxClearHazards(io, socket),
        handleSandboxSetGodMode(io, socket, { enabled: true }),
        handleSandboxSetSim(io, socket, { paused: true }),
        handleSandboxReset(io, socket),
      ]);
      for (const r of results) expect(r).toEqual({ success: false, error: 'Sandbox tools are only available in the sandbox.' });
      expect(miningSessionManager.getSession('hs-solo')!.getPlayer('hs-solo')!.godMode).toBeUndefined();
    });

    it('refuses without a character or a session', async () => {
      expect(await handleSandboxReset(io, socketFor(undefined))).toEqual({ success: false, error: 'No character selected.' });
      expect(await handleSandboxReset(io, socketFor('nobody'))).toEqual({ success: false, error: 'No active mining session.' });
    });
  });

  describe('in the sandbox', () => {
    it('pours fluid, reports bad input and spawns mobs', async () => {
      join('hs-a', 'sandbox');
      const socket = socketFor('hs-a');
      expect(await handleSandboxPourFluid(io, socket, { x: 60, y: SKY + 13, fluidKey: 'OIL' })).toEqual({ success: true, data: undefined });
      expect(miningSessionManager.getSession('hs-a')!.fluidSubsystem.grid.getLevel(60, SKY + 13)).toBeGreaterThan(0);
      expect(await handleSandboxPourFluid(io, socket, { x: 'a', y: SKY + 13, fluidKey: 'OIL' })).toMatchObject({ success: false });
      expect(await handleSandboxPourFluid(io, socket, undefined as any)).toMatchObject({ success: false });
      expect(await handleSandboxSpawnMob(io, socket, { mobId: 'Mole Person', x: 61.5, y: SKY + 13 })).toMatchObject({ success: true });
      expect(await handleSandboxSpawnMob(io, socket, { mobId: 'nope', x: 61.5, y: SKY + 13 })).toEqual({ success: false, error: 'Unknown mob.' });
    });

    it('releases gas, and reports bad input', async () => {
      join('hs-a', 'sandbox');
      const socket = socketFor('hs-a');
      expect(await handleSandboxReleaseGas(io, socket, { x: 60, y: SKY - 3, gasKey: 'HYDROGEN' })).toEqual({ success: true, data: undefined });
      expect(miningSessionManager.getSession('hs-a')!.gasSubsystem.grid.getConcentration(60, SKY - 3)).toBeGreaterThan(0);
      expect(await handleSandboxReleaseGas(io, socket, { x: 60, y: SKY - 3, gasKey: 'NOPE' })).toEqual({ success: false, error: 'Unknown gas.' });
      expect(await handleSandboxReleaseGas(io, socket, { x: 'a', y: SKY - 3, gasKey: 'HYDROGEN' })).toMatchObject({ success: false });
      expect(await handleSandboxReleaseGas(io, socket, undefined as any)).toMatchObject({ success: false });
    });

    it('returns the settings after changing them', async () => {
      join('hs-a', 'sandbox');
      const socket = socketFor('hs-a');
      expect(await handleSandboxSetGodMode(io, socket, { enabled: true })).toEqual({
        success: true,
        data: { status: { godMode: true, paused: false, speed: 1 } },
      });
      expect(await handleSandboxSetSim(io, socket, { paused: true, speed: 2 })).toEqual({
        success: true,
        data: { status: { godMode: true, paused: true, speed: 2 } },
      });
      expect(await handleSandboxSetSim(io, socket, { speed: 7 })).toEqual({ success: false, error: 'Unsupported speed.' });
    });

    it('reset sends every player in the room a fresh state', async () => {
      const a = socketFor('hs-a');
      const b = socketFor('hs-b');
      join('hs-a', 'sandbox', a);
      join('hs-b', 'sandbox', b);
      expect(await handleSandboxReset(io, a)).toEqual({ success: true });
      for (const s of [a, b]) {
        const call = s.emit.mock.calls.find((c: unknown[]) => c[0] === 'mining_sandbox_reset');
        expect(call).toBeDefined();
        expect(call![1].sessionState.gameMode).toBe('sandbox');
        expect(call![1].sessionState.grid).toHaveLength(30 + SKY);
        expect(call![1].sessionState.surfaceRow).toBe(SKY);
        expect(call![1].sessionState.sandbox.mobs.length).toBeGreaterThan(0);
      }
    });
  });
});
