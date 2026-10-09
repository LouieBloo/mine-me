import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn() } } }));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));

const loadout = (over: Record<string, unknown> = {}) => ({
  miningSpeed: 25, toolDamage: 25, weaponDamage: 25, pickPower: 0, knockback: 0, gearLayers: [], equippedWeaponId: null, ...over,
});

describe('engine player API: every call names its player', () => {
  let engine: MiningGameEngine;
  const sock = () => ({ connected: true, emit: vi.fn() }) as any;
  const A = 'alice';
  const B = 'bob';

  beforeEach(() => {
    engine = new MiningGameEngine({ roomId: 'api-room', gameMode: 'multiplayer', cityId: 'c', seed: 8, mapConfig: { mobSpawnCount: 0 } });
    engine.addPlayer({ characterId: A, characterName: 'Alice', socket: sock(), miningSpeed: 25 });
    engine.addPlayer({ characterId: B, characterName: 'Bob', socket: sock(), miningSpeed: 25 });
    // Open room with a dirt floor; both players stand in it
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    for (const [id, x] of [[A, 20.5], [B, 24.5]] as const) {
      const p = engine.getPlayer(id)!;
      p.playerBody.position = { x, y: 21 - p.playerBody.halfHeight };
      p.playerBody.isGrounded = true;
    }
  });

  it('no longer exposes single-player state on the engine', () => {
    for (const name of ['primarySession', 'primaryCharacterId', 'playerBody', 'position', 'velocity', 'inputs', 'isMining', 'miningTarget', 'temporaryBackpack', 'visionRange', 'miningSpeed']) {
      expect(name in engine, name).toBe(false);
    }
  });

  describe('unknown players are harmless', () => {
    it('does nothing and does not throw', () => {
      expect(engine.startMining('ghost', { x: 22, y: 20 })).toBe(false);
      expect(() => engine.stopMining('ghost')).not.toThrow();
      expect(engine.placeLadder('ghost')).toBe(false);
      expect(engine.placeLadder('ghost', { x: 22, y: 20 })).toBe(false);
      expect(engine.placeTorch('ghost', { x: 22, y: 20 })).toBe(false);
      expect(engine.canPlaceLadder('ghost')).toBe(false);
      expect(engine.canPlaceTorch('ghost', { x: 22, y: 20 })).toBe(false);
      expect(() => engine.setMiningSpeed('ghost', 50)).not.toThrow();
      expect(() => engine.setLoadout('ghost', loadout())).not.toThrow();
      expect(() => engine.setSocket('ghost', sock())).not.toThrow();
      expect(() => engine.handleInput('ghost', { up: false, down: false, left: false, right: true, miningKey: false, sequence: 1 })).not.toThrow();
      expect(engine.increaseVisionRange('ghost', 2)).toBe(MINING_CONFIG.DEFAULT_VISION_RANGE);
    });

    it('leaves the real players untouched', () => {
      engine.handleInput('ghost', { up: false, down: false, left: false, right: true, miningKey: true, sequence: 9 });
      expect(engine.getPlayer(A)!.inputs.right).toBe(false);
      expect(engine.getPlayer(B)!.inputs.miningKey).toBe(false);
    });
  });

  describe('players are independent', () => {
    it('input goes only to the named player', () => {
      engine.handleInput(B, { up: false, down: false, left: false, right: true, miningKey: false, sequence: 1 });
      expect(engine.getPlayer(B)!.inputs.right).toBe(true);
      expect(engine.getPlayer(A)!.inputs.right).toBe(false);
    });

    it('startMining / stopMining affect only that player', () => {
      engine.grid[20][21] = { type: MiningTileType.DIRT, revealed: true }; // within Alice's reach (x = 20.5)
      engine.grid[20][25] = { type: MiningTileType.DIRT, revealed: true }; // within Bob's reach (x = 24.5)
      expect(engine.startMining(A, { x: 21, y: 20 })).toBe(true);
      expect(engine.getPlayer(A)!.isMining).toBe(true);
      expect(engine.getPlayer(B)!.isMining).toBe(false);

      // Reach is measured from the named player: Alice cannot start on Bob's block
      expect(engine.startMining(A, { x: 25, y: 20 })).toBe(false);

      expect(engine.startMining(B, { x: 25, y: 20 })).toBe(true);
      engine.stopMining(A);
      expect(engine.getPlayer(A)!.isMining).toBe(false);
      expect(engine.getPlayer(B)!.isMining).toBe(true);
    });

    it('placing a ladder with no target uses the named player\'s own tile', () => {
      expect(engine.placeLadder(B)).toBe(true);
      const bobTile = Math.floor(engine.getPlayer(B)!.playerBody.position.x);
      expect(engine.grid[Math.floor(engine.getPlayer(B)!.playerBody.position.y)][bobTile].type).toBe(MiningTileType.LADDER);
      const aliceTile = Math.floor(engine.getPlayer(A)!.playerBody.position.x);
      expect(engine.grid[Math.floor(engine.getPlayer(A)!.playerBody.position.y)][aliceTile].type).toBe(MiningTileType.EMPTY);
    });

    it('placement reach is measured from the named player', () => {
      // Bob (x=24.5) can reach x=25, Alice (x=20.5) cannot
      expect(engine.canPlaceTorch(B, { x: 25, y: 20 })).toBe(true);
      expect(engine.canPlaceTorch(A, { x: 25, y: 20 })).toBe(false);
    });

    it('setMiningSpeed / setLoadout / vision change only the named player', () => {
      // Always check the *second* player too, so "acts on whoever joined first" bugs cannot hide
      engine.setMiningSpeed(B, 80);
      expect(engine.getPlayer(B)!.miningSpeed).toBe(80);
      expect(engine.getPlayer(A)!.miningSpeed).toBe(25);

      engine.setLoadout(B, loadout({ toolDamage: 99, pickPower: 4, equippedWeaponId: 'cmn_revolver_6shooter' }));
      expect(engine.getPlayer(B)).toMatchObject({ toolDamage: 99, pickPower: 4, equippedWeaponId: 'cmn_revolver_6shooter' });
      expect(engine.getPlayer(A)).toMatchObject({ toolDamage: 25, pickPower: 0, equippedWeaponId: null });

      expect(engine.increaseVisionRange(B, 3)).toBe(MINING_CONFIG.DEFAULT_VISION_RANGE + 3);
      expect(engine.getPlayer(A)!.visionRange).toBe(MINING_CONFIG.DEFAULT_VISION_RANGE);

      engine.setMiningSpeed(A, 40);
      expect(engine.getPlayer(A)!.miningSpeed).toBe(40);
      expect(engine.getPlayer(B)!.miningSpeed).toBe(25); // Bob's loadout (speed 25) replaced his earlier 80
    });

    it('setSocket swaps only the named player\'s socket', () => {
      const fresh = sock();
      const bobBefore = engine.getPlayer(B)!.socket;
      engine.setSocket(A, fresh);
      expect(engine.getPlayer(A)!.socket).toBe(fresh);
      expect(engine.getPlayer(B)!.socket).toBe(bobBefore);
    });
  });

  describe('there is no special first player', () => {
    it('the first player leaving does not disturb the other', () => {
      engine.removePlayer(A);
      expect(engine.playerCount).toBe(1);
      engine.handleInput(B, { up: false, down: false, left: true, right: false, miningKey: false, sequence: 2 });
      expect(engine.getPlayer(B)!.inputs.left).toBe(true);
      expect(() => (engine as any).tick(1 / 30)).not.toThrow();
    });

    it('either player can keep the room alive', () => {
      const emptied = vi.fn();
      const e2 = new MiningGameEngine({ roomId: 'r2', cityId: 'c', seed: 1, onRoomEmpty: emptied, mapConfig: { mobSpawnCount: 0 } });
      e2.addPlayer({ characterId: 'x', socket: sock() });
      e2.addPlayer({ characterId: 'y', socket: sock() });
      e2.removePlayer('x');
      expect(emptied).not.toHaveBeenCalled();
      e2.removePlayer('y');
      expect(emptied).toHaveBeenCalledWith('r2');
    });
  });

  describe('melee', () => {
    it('hits mobs in the hit box of a player whose swing fired, through the damage system', () => {
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      const p = engine.getPlayer(A)!;
      p.swungThisTick = true;
      p.aimDirection = { x: 1, y: 0 };
      const mob = engine.spawnMob({ id: 'm', name: 'M', health: 100 }, { x: 21.4, y: 21 });
      engine.playerManager.handleMeleeAttacks();
      expect(spy).toHaveBeenCalledWith({ kind: 'mob', id: mob.id }, expect.objectContaining({ type: 'melee', source: expect.objectContaining({ id: A }) }));
    });

    it('lets every swinging player hit (a shared mob list is never used up by the first player)', () => {
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      const mob = engine.spawnMob({ id: 'm', name: 'M', health: 1000, aiType: 'STATIONARY', moveSpeed: 0, jumpForce: 0 }, { x: 22.5, y: 21 });
      for (const id of [A, B]) {
        const p = engine.getPlayer(id)!;
        p.swungThisTick = true;
        p.aimDirection = { x: id === A ? 1 : -1, y: 0 };
        p.playerBody.position = { x: id === A ? 21.7 : 23.3, y: 21 - p.playerBody.halfHeight };
      }
      engine.playerManager.handleMeleeAttacks();
      const attackers = spy.mock.calls.filter(([t]) => (t as any).id === mob.id).map(([, e]) => e.source.id);
      expect(attackers.sort()).toEqual([A, B]);
    });

    it('does nothing for players who did not swing', () => {
      const spy = vi.spyOn(engine.damageSystem, 'applyDamage');
      engine.spawnMob({ id: 'm', name: 'M', health: 100 }, { x: 21.4, y: 21 });
      engine.playerManager.handleMeleeAttacks();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('MiningSessionManager.buildClientState', () => {
  const sock = () => ({ connected: true, emit: vi.fn() }) as any;

  it('describes the named player, not "the first player"', () => {
    const manager = MiningSessionManager.getInstance();
    const e1 = manager.createSession('snap-a', 'c', sock(), false, 25, 'multiplayer', 'A');
    manager.createSession('snap-b', 'c', sock(), false, 25, 'multiplayer', 'B');
    const a = e1.getPlayer('snap-a')!;
    const b = e1.getPlayer('snap-b')!;
    a.temporaryBackpack.push({ itemId: 'i1', itemName: 'A item', quantity: 1, iconUrl: null });
    b.visionRange = 11;

    const stateA = manager.buildClientState(e1, 'snap-a');
    const stateB = manager.buildClientState(e1, 'snap-b');
    expect(stateA.temporaryBackpack).toHaveLength(1);
    expect(stateB.temporaryBackpack).toHaveLength(0);
    expect(stateB.visionRange).toBe(11);
    expect(stateA.otherPlayers?.map((p) => p.characterId)).toEqual(['snap-b']);
    expect(stateB.otherPlayers?.map((p) => p.characterId)).toEqual(['snap-a']);

    manager.cancelSession('snap-a', { persistHealth: false });
    manager.cancelSession('snap-b', { persistHealth: false });
  });

  it('throws a clear error for a player that is not in the room', () => {
    const manager = MiningSessionManager.getInstance();
    const e = manager.createSession('snap-c', 'c', sock(), true);
    expect(() => manager.buildClientState(e, 'nobody')).toThrow(/not in this mining room/);
    manager.cancelSession('snap-c', { persistHealth: false });
  });
});
