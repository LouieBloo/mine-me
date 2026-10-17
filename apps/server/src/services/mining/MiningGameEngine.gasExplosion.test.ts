import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

const ignitesItem = (id: string, value = 100) => ({ id, name: id, itemEffects: [{ value, effect: { ignites: true } }] });
const OIL_BURNS = { ignitionChance: 1, spreadChance: 0, burnDuration: 8, heat: 3, burnsInto: null };

/** Plenty, so a test measures how much damage there was rather than who died. */
const HEALTH = 10000;

describe('explosive gas going off', () => {
  const cid = 'boom-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const gas = () => engine.gasSubsystem;
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const total = (key: string) => gas().grid.totalVolume(gas().registry.idOf(key)!);

  /** A sealed hall x 20..31, y 20..22 (12 x 3) in solid dirt, with the player far away at the left. */
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Forget the generated fluid while its cells are still open (a cell that is solid cannot be emptied)
    { const fg = engine.fluidSubsystem.grid; for (let y = 0; y < fg.height; y++) for (let x = 0; x < fg.width; x++) fg.setCell(x, y, 0, 0); }
    for (let y = 18; y <= 24; y++) {
      for (let x = 18; x <= 33; x++) {
        const open = x >= 20 && x <= 31 && y >= 20 && y <= 22;
        engine.grid[y][x] = { type: open ? MiningTileType.EMPTY : MiningTileType.DIRT, revealed: true };
      }
    }
    // Forget the generated gas and fluid, so only what each test places is there
    const g = gas().grid;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) g.setCell(x, y, 0, 0);
    gas().drainChanges();
    me().playerBody.position = { x: 5.5, y: 5.5 };
    engine.dataManager.getFluid('OIL')!.flammability = OIL_BURNS;
  });

  afterEach(() => vi.restoreAllMocks());

  /** Fills the hall's cells x0..x1 (all three rows) with a gas. */
  const fill = (key: string, x0: number, x1: number, amount = 1) => {
    for (let x = x0; x <= x1; x++) for (let y = 20; y <= 22; y++) gas().placeGas(x, y, key, amount);
  };
  const spark = (x: number, y: number) => engine.ignitionSubsystem.emit(x + 0.5, y + 0.5, 0.4, 1);

  describe('what goes off', () => {
    it('knows hydrogen explodes and nitrogen does not, from the data', () => {
      fill('HYDROGEN', 20, 21);
      fill('NITROGEN', 30, 31);
      expect(engine.gasExplosionSubsystem.canIgnite(20, 20)).toBe(true);
      expect(engine.gasExplosionSubsystem.canIgnite(30, 20)).toBe(false);
      expect(engine.gasExplosionSubsystem.canIgnite(25, 20)).toBe(false); // clear air
      expect(engine.gasExplosionSubsystem.flammabilityAt(20, 20)?.explosion?.frontSpeed).toBe(3);
    });

    it('a spark on hydrogen lines it up; it does not burn as a fluid fire', () => {
      fill('HYDROGEN', 20, 25);
      expect(spark(22, 21)).toBe(1);
      expect(engine.gasExplosionSubsystem.pendingCount).toBe(1);
      expect(engine.ignitionSubsystem.pendingCount).toBe(0);
      expect(engine.fireSubsystem.grid.burningCount).toBe(0);
    });

    it('a spark on nitrogen does nothing, however long it is held', () => {
      fill('NITROGEN', 20, 25);
      expect(spark(22, 21)).toBe(0);
      expect(engine.gasExplosionSubsystem.pendingCount).toBe(0);
      tick(60);
      expect(total('NITROGEN')).toBeGreaterThan(5);
    });

    it('the ignition chance is the gas\'s own: a failed roll leaves it alone', () => {
      fill('HYDROGEN', 20, 25);
      vi.mocked(Math.random).mockReturnValue(0.99);
      expect(spark(22, 21)).toBe(0);
      expect(engine.gasExplosionSubsystem.pendingCount).toBe(0);
    });

    it('a spark in clear air next to the gas does nothing; a weaker source is less likely to set it off', () => {
      fill('HYDROGEN', 20, 22);
      expect(engine.ignitionSubsystem.emit(26.5, 21.5, 0.4, 1)).toBe(0);
      vi.mocked(Math.random).mockReturnValue(0.5);
      expect(engine.ignitionSubsystem.emit(21.5, 21.5, 0.4, 1)).toBe(1); // 0.9 chance beats 0.5
      engine.gasExplosionSubsystem.step();
      fill('HYDROGEN', 20, 22);
      expect(engine.ignitionSubsystem.emit(21.5, 21.5, 0.4, 0.3)).toBe(0); // 0.27 chance does not
    });

    it('gas too thin to explode is left alone', () => {
      fill('HYDROGEN', 20, 25, 0.05);
      expect(spark(22, 21)).toBe(0);
    });
  });

  describe('the front', () => {
    it('crosses a hall as a wave over several gas steps, consuming the gas as it goes', () => {
      fill('HYDROGEN', 20, 31);
      const before = total('HYDROGEN');
      spark(20, 21);
      gas().grid.drainChanges();
      const steps: number[] = [];
      for (let n = 0; n < 12; n++) {
        engine.gasExplosionSubsystem.step();
        steps.push(total('HYDROGEN'));
      }
      expect(steps[0]).toBeLessThan(before);
      // It takes more than one step to go through the whole hall
      expect(steps[0]).toBeGreaterThan(0);
      expect(steps[steps.length - 1]).toBe(0);
      // ...and loses gas every step until it is all gone, never regaining any
      for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-6);
    });

    it('goes off on the gas beat during normal ticks, and only on every Nth tick', () => {
      fill('HYDROGEN', 20, 21);
      spark(20, 21);
      const start = (engine as any).tickCount as number;
      // Run to just before the next gas beat: nothing has gone off yet
      tick(3 - 1 - (start % 3));
      expect(total('HYDROGEN')).toBeGreaterThan(5);
      tick(3);
      expect(total('HYDROGEN')).toBeLessThan(6);
    });

    it('does not set off a pocket that is not connected to the one lit', () => {
      fill('HYDROGEN', 20, 22);
      fill('HYDROGEN', 26, 28);
      spark(20, 21);
      for (let n = 0; n < 10; n++) engine.gasExplosionSubsystem.step();
      expect(gas().grid.getConcentration(26, 21)).toBeGreaterThan(0.5);
      expect(gas().grid.getConcentration(21, 21)).toBe(0);
    });

    it('is carried across a gap of thin gas only if it is thick enough to burn', () => {
      fill('HYDROGEN', 20, 22);
      fill('HYDROGEN', 24, 26);
      fill('HYDROGEN', 23, 23, 0.05);
      spark(20, 21);
      for (let n = 0; n < 10; n++) engine.gasExplosionSubsystem.step();
      expect(gas().grid.getConcentration(25, 21)).toBeGreaterThan(0.5);
    });

    it('leaves the terrain exactly as it was', () => {
      fill('HYDROGEN', 20, 31);
      const before = JSON.stringify(engine.grid.map((row) => row.map((t) => t.type)));
      spark(20, 21);
      for (let n = 0; n < 12; n++) engine.gasExplosionSubsystem.step();
      expect(JSON.stringify(engine.grid.map((row) => row.map((t) => t.type)))).toBe(before);
    });

    it('is deterministic', () => {
      const run = () => {
        fill('HYDROGEN', 20, 31);
        spark(24, 21);
        const out: string[] = [];
        for (let n = 0; n < 6; n++) {
          engine.gasExplosionSubsystem.step();
          out.push(JSON.stringify(engine.gasExplosionSubsystem.takeDetonations()));
        }
        return out;
      };
      const a = run();
      fill('HYDROGEN', 20, 31);
      spark(24, 21);
      const b: string[] = [];
      for (let n = 0; n < 6; n++) {
        engine.gasExplosionSubsystem.step();
        b.push(JSON.stringify(engine.gasExplosionSubsystem.takeDetonations()));
      }
      expect(b).toEqual(a);
    });
  });

  describe('what it hurts', () => {
    const standAt = (x: number, y: number) => {
      me().playerBody.position = { x, y };
      me().health = HEALTH;
      me().maxHealth = HEALTH;
    };

    it('hurts a player in the blast, and not one far from it', () => {
      fill('HYDROGEN', 20, 21);
      standAt(21.5, 21.5);
      spark(20, 21);
      engine.gasExplosionSubsystem.step();
      expect(me().health).toBeLessThan(HEALTH);
      standAt(5.5, 5.5);
      fill('HYDROGEN', 20, 21);
      spark(20, 21);
      engine.gasExplosionSubsystem.step();
      expect(me().health).toBe(HEALTH);
    });

    it('hurts more the thicker the gas, and more for a bigger pocket', () => {
      const hurtBy = (amount: number, x1: number) => {
        for (let x = 20; x <= 31; x++) for (let y = 20; y <= 22; y++) gas().grid.setCell(x, y, 0, 0);
        fill('HYDROGEN', 20, x1, amount);
        standAt(20.5, 21.5);
        spark(20, 21);
        for (let n = 0; n < 12; n++) engine.gasExplosionSubsystem.step();
        return HEALTH - me().health;
      };
      const wisp = hurtBy(0.2, 21);
      const thick = hurtBy(1, 21);
      const bigPocket = hurtBy(1, 25);
      expect(wisp).toBeGreaterThan(0);
      expect(thick).toBeGreaterThan(wisp);
      expect(bigPocket).toBeGreaterThan(thick);
    });

    it('hurts a player each step the front passes, even straight after a hit', () => {
      fill('HYDROGEN', 20, 31);
      standAt(26.5, 21.5);
      spark(20, 21);
      const healths: number[] = [];
      for (let n = 0; n < 12; n++) {
        engine.gasExplosionSubsystem.step();
        healths.push(me().health);
      }
      const drops = healths.filter((h, i) => h < (i === 0 ? HEALTH : healths[i - 1])).length;
      expect(drops).toBeGreaterThan(1);
    });

    it('hurts a mob in the blast too, and a player takes the hit from the explosion, not from another player', () => {
      fill('HYDROGEN', 20, 21);
      const events: any[] = [];
      const original = engine.damageSystem.applyDamage.bind(engine.damageSystem);
      vi.spyOn(engine.damageSystem, 'applyDamage').mockImplementation((target, event) => {
        events.push({ target, event });
        return original(target, event);
      });
      standAt(21.5, 21.5);
      spark(20, 21);
      engine.gasExplosionSubsystem.step();
      const hit = events.find((e) => e.target.kind === 'player');
      expect(hit.event.type).toBe('explosive');
      expect(hit.event.source.kind).toBe('explosion');
      expect(hit.event.ignoreInvulnerability).toBe(true);
      expect(hit.event.knockback).toBeTruthy();
    });

    it('hurts nobody when the gas goes off out of reach of everyone', () => {
      fill('HYDROGEN', 20, 31);
      standAt(5.5, 5.5);
      spark(20, 21);
      for (let n = 0; n < 12; n++) engine.gasExplosionSubsystem.step();
      expect(me().health).toBe(HEALTH);
    });
  });

  describe('what lights it', () => {
    it('a placed torch that ignites sets off the hydrogen it touches, and a plain one does not', () => {
      const items = new Map<string, unknown>([['torch', ignitesItem('torch')], ['damp', { id: 'damp', name: 'damp', itemEffects: [] }]]);
      const original = engine.dataManager.getItemData.bind(engine.dataManager);
      vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => (items.get(id) as any) ?? original(id));
      fill('HYDROGEN', 20, 25);
      engine.grid[21][21] = { type: MiningTileType.EMPTY, revealed: true };
      me().playerBody.position = { x: 21.5, y: 21.5 };
      expect(engine.placeTorch(cid, { x: 21, y: 21 }, 'damp')).toBe(true);
      engine.ignitionSubsystem.emitFromSources();
      expect(engine.gasExplosionSubsystem.pendingCount).toBe(0);
      engine.grid[21][23] = { type: MiningTileType.EMPTY, revealed: true };
      me().playerBody.position = { x: 23.5, y: 21.5 };
      expect(engine.placeTorch(cid, { x: 23, y: 21 }, 'torch')).toBe(true);
      engine.ignitionSubsystem.emitFromSources();
      expect(engine.gasExplosionSubsystem.pendingCount).toBeGreaterThan(0);
    });

    it('fire burning next to hydrogen sets it off', () => {
      fill('HYDROGEN', 24, 31);
      engine.fluidSubsystem.placeFluid(22, 22, 'OIL', 1);
      expect(engine.fireSubsystem.grid.ignite(22, 22)).toBe(true);
      engine.fireSubsystem.step();
      // The burning oil is two cells from the gas: not touching, so nothing yet
      expect(engine.gasExplosionSubsystem.pendingCount).toBe(0);
      engine.fluidSubsystem.placeFluid(23, 22, 'OIL', 1);
      expect(engine.fireSubsystem.grid.ignite(23, 22)).toBe(true);
      engine.fireSubsystem.step();
      expect(engine.gasExplosionSubsystem.pendingCount).toBeGreaterThan(0);
    });

    it('an explosion lights the oil beside it', () => {
      fill('HYDROGEN', 20, 22);
      engine.fluidSubsystem.placeFluid(23, 22, 'OIL', 1);
      spark(22, 22);
      engine.gasExplosionSubsystem.step();
      expect(engine.ignitionSubsystem.pendingCount).toBeGreaterThan(0);
    });

    it('a burning explosion does not light nitrogen or leave fire where there was only gas', () => {
      fill('HYDROGEN', 20, 22);
      fill('NITROGEN', 23, 25);
      spark(22, 21);
      for (let n = 0; n < 5; n++) engine.gasExplosionSubsystem.step();
      expect(total('NITROGEN')).toBeGreaterThan(5);
      expect(engine.fireSubsystem.grid.burningCount).toBe(0);
    });
  });

  describe('on the wire', () => {
    it('reports each detonated cell as [x, y, gasId] to a client that can see it, and only on the tick it happened', () => {
      fill('HYDROGEN', 20, 22);
      spark(20, 21);
      tick(3);
      const cells = ticks().flatMap((t) => t.gasExplosions ?? []);
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) expect(cell[2]).toBe(gas().registry.idOf('HYDROGEN'));
      tick(60);
      const before = ticks().length;
      tick(10);
      expect(ticks().slice(before).every((t) => t.gasExplosions === undefined)).toBe(true);
    });

    it('never reports a detonation in a tile the player has not seen', () => {
      fill('HYDROGEN', 20, 22);
      for (let y = 20; y <= 22; y++) for (let x = 20; x <= 31; x++) engine.grid[y][x].revealed = false;
      spark(20, 21);
      tick(30);
      expect(ticks().every((t) => !t.gasExplosions || t.gasExplosions.length === 0)).toBe(true);
    });

    it('tells a joining client how an exploding gas looks, resolved from the particle library and its light', () => {
      const FLASH = { burstCount: 20 } as any;
      vi.spyOn(engine.dataManager, 'getParticleEffect').mockImplementation((id) => (id === 'pe_dynamite_explosion_flash' ? ({ id, config: FLASH } as any) : undefined));
      const defs = MiningSessionManager.getInstance().buildClientState(engine, cid).gases!;
      const hydrogen = defs.find((d) => d.typeKey === 'HYDROGEN')!;
      expect(hydrogen.explosion?.effect).toEqual(FLASH);
      expect(hydrogen.explosion?.light).toMatchObject({ color: '#cfe8ff', radius: 3 });
      expect(defs.find((d) => d.typeKey === 'NITROGEN')!.explosion).toBeUndefined();
    });

    it('sends no explosion look for a gas that burns but does not explode', () => {
      engine.dataManager.getGas('HYDROGEN')!.flammability = { ignitionChance: 1, spreadChance: 1, burnDuration: 1, heat: 1, flameEffectId: 'x' } as any;
      expect(gas().clientDefinitions().find((d) => d.typeKey === 'HYDROGEN')!.explosion).toBeUndefined();
    });
  });
});
