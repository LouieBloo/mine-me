import { describe, it, vi } from 'vitest';
import type { MiningServerPerf } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { SANDBOX_BLOCK_SCALE, SANDBOX_SKY_ROWS } from './sandbox/SandboxLayout';

/**
 * A server-only lag hunt for the sandbox: runs the real room through a few busy scenes and prints what each step of
 * the tick costs, so the server can be ruled in or out without opening the game. It is skipped in normal test runs.
 *
 *   PROFILE_SANDBOX=1 npx vitest run src/services/mining/profileSandbox.perf.test.ts
 */
const TICKS = 150;

const start = () =>
  new MiningGameEngine({
    characterId: 'sbx', cityId: 'c', seed: 1, gameMode: 'sandbox', maxHealth: 100,
    socket: { connected: true, emit: vi.fn() } as any,
    mapConfig: { surfaceDummyMobId: 'mob_target_dummy', mobSpawnCount: 3 },
  });

const run = (engine: MiningGameEngine): MiningServerPerf => {
  for (let i = 0; i < TICKS; i++) (engine as any).tick(1 / 30);
  return engine.profiler.snapshot(engine.droppedTicks, {});
};

const print = (scene: string, perf: MiningServerPerf) => {
  const lines = perf.steps.slice(0, 8).map((s) => `    ${s.name.padEnd(26)} avg ${String(s.avgMs).padStart(6)}ms  peak ${s.maxMs}ms`);
  process.stdout.write(`\n[${scene}] tick avg ${perf.tickMs.avg}ms p95 ${perf.tickMs.p95}ms max ${perf.tickMs.max}ms of ${perf.budgetMs}ms (${perf.loadPercent}% load)\n${lines.join('\n')}` + "\n");
};

describe.skipIf(!process.env.PROFILE_SANDBOX)('sandbox server cost', () => {
  it('idle room', () => {
    print('idle', run(start()));
  });

  it('a pool of water poured over the floor', () => {
    const e = start();
    const S = SANDBOX_BLOCK_SCALE;
    for (let x = 10 * S; x < 40 * S; x++) for (let y = SANDBOX_SKY_ROWS; y < SANDBOX_SKY_ROWS + 4; y++) e.fluidSubsystem.placeFluid(x, y, 'WATER', 1);
    print('water poured', run(e));
  });

  it('forty loose items falling', () => {
    const e = start();
    const S = SANDBOX_BLOCK_SCALE;
    e.dropSubsystem.spawnDrops(
      Array.from({ length: 40 }, () => ({ itemId: 'item_bridge', quantity: 1 })),
      { x: 20 * S, y: SANDBOX_SKY_ROWS - 4 * S }
    );
    print('items falling', run(e));
  });
});
