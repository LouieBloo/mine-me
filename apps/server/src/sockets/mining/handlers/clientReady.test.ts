import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../../../services/runStash.service', () => ({ RunStashService: { bank: vi.fn().mockResolvedValue({ banked: [], stash: [], skipped: [] }), add: vi.fn() } }));

import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { EXTRACTOR_CLIENT_WAIT_SECONDS } from '../../../services/mining/subsystems/MiningExtractorSubsystem';
import { handleMiningClientReady } from './exitMiningSession';

const socketFor = (characterId: string | undefined) => ({ data: { characterId }, connected: true, emit: vi.fn() }) as any;
const tickFor = (engine: any, seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) engine.tick(1 / 30); };

describe('mining_client_ready', () => {
  afterEach(() => miningSessionManager.cancelSession('ready-a', { persistHealth: false }));

  it('lets the extractor of a real run land only once the client says the mine is on screen', async () => {
    const socket = socketFor('ready-a');
    const engine = miningSessionManager.createSession('ready-a', 'city', socket, true);
    const ex = engine.extractorSubsystem!;
    tickFor(engine, ex.definition.landingSeconds + 1);
    expect(ex.isLanded()).toBe(false); // a joined client that is still loading does not start the flight
    expect(await handleMiningClientReady({} as any, socket)).toEqual({ success: true });
    tickFor(engine, ex.definition.landingSeconds + 0.3);
    expect(ex.isLanded()).toBe(true);
  });

  it('still lands on its own if the client never says so', () => {
    const engine = miningSessionManager.createSession('ready-a', 'city', socketFor('ready-a'), true);
    tickFor(engine, EXTRACTOR_CLIENT_WAIT_SECONDS + engine.extractorSubsystem!.definition.landingSeconds + 1);
    expect(engine.extractorSubsystem!.isLanded()).toBe(true);
  });

  it('is harmless without a character or outside a mine, and when repeated', async () => {
    expect(await handleMiningClientReady({} as any, socketFor(undefined))).toMatchObject({ success: false });
    expect(await handleMiningClientReady({} as any, socketFor('nobody'))).toEqual({ success: true });
    const socket = socketFor('ready-a');
    miningSessionManager.createSession('ready-a', 'city', socket, true);
    await handleMiningClientReady({} as any, socket);
    await handleMiningClientReady({} as any, socket);
  });
});
