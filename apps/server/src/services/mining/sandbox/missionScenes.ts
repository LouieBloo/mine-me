import { type MissionDefinition, type ObjectiveDefinition, type SandboxMobOption } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';
import { SANDBOX_BLOCK_SCALE, SANDBOX_HALL_OLD } from './SandboxLayout';

/**
 * Named test scenes for missions (ticket 116, like the fluid, extractor and doodad scenes): each one starts a one-off mission and
 * sets the room up so its objective can be reached, so a mission bug is reproduced from the same start every time. A scene works
 * through the room's own subsystems (the real tracker, the real gas, the real mobs), never around them.
 */
export interface MissionScene {
  id: string;
  name: string;
  description: string;
  apply(engine: MiningGameEngine, characterId: string): { ok: true } | { ok: false; error: string };
}

const S = SANDBOX_BLOCK_SCALE;

/** A mission made on the spot (no reward, level range open) from a list of objectives. */
export function adHocMission(id: string, name: string, objectives: ObjectiveDefinition[]): MissionDefinition {
  return { id: `sandbox_${id}`, key: `sandbox_${id}`, name, description: 'A test mission started from the sandbox.', minLevel: 1, maxLevel: 999, tier: 1, weight: 1, objectives, rewardSol: 0, rewardXp: 0, rewardItems: [] };
}

/** The hall in cells of the whole map: its open columns and the row of its floor. */
function hallOf(engine: MiningGameEngine) {
  return {
    x0: SANDBOX_HALL_OLD.x0 * S,
    x1: (SANDBOX_HALL_OLD.x1 + 1) * S - 1,
    top: engine.surfaceRow + SANDBOX_HALL_OLD.y0 * S,
    floor: engine.surfaceRow + (SANDBOX_HALL_OLD.y1 + 1) * S - 1,
  };
}

const moveTo = (engine: MiningGameEngine, characterId: string, x: number, y: number) => {
  const body = engine.getPlayer(characterId)?.playerBody;
  if (!body) return;
  body.position = { x, y };
  body.velocity = { x: 0, y: 0 };
};

export const MISSION_SCENES: readonly MissionScene[] = [
  {
    id: 'clear-gas',
    name: 'Clear a gas pocket',
    description: 'A cloud of the first gas fills part of the hall; the mission is to clear 8 of its 15 cells (vent it, burn it or blow it up).',
    apply(engine, characterId) {
      const gas = engine.dataManager.getGases()[0];
      if (!gas) return { ok: false, error: 'No gas is defined.' };
      const hall = hallOf(engine);
      const x = Math.floor((hall.x0 + hall.x1) / 2) - 2;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 5; dx++) engine.gasSubsystem.placeGas(x + dx, hall.floor - dy, gas.typeKey, 1);
      engine.setMission(adHocMission('clear-gas', `Clear the ${gas.name}`, [{ type: 'CLEAR_GAS', targetId: gas.id, amount: 8 }]));
      moveTo(engine, characterId, x - 3, hall.floor);
      return { ok: true };
    },
  },
  {
    id: 'kill-mobs',
    name: 'Kill two mobs',
    description: 'Two mobs stand in the hall; the mission is to kill any two (shoot them, blast them, or set them alight).',
    apply(engine, characterId) {
      const dummyId = engine.mapConfig?.surfaceDummyMobId;
      const mob = engine.dataManager.getMobs().find((m) => m.id !== dummyId);
      if (!mob) return { ok: false, error: 'No mob is defined.' };
      const hall = hallOf(engine);
      const x = Math.floor((hall.x0 + hall.x1) / 2);
      engine.mobSubsystem.spawnMob(mob, { x: x + 4, y: hall.floor - 1 });
      engine.mobSubsystem.spawnMob(mob, { x: x + 8, y: hall.floor - 1 });
      engine.setMission(adHocMission('kill-mobs', 'Kill two mobs', [{ type: 'KILL_MOB', amount: 2 }]));
      moveTo(engine, characterId, x - 3, hall.floor);
      return { ok: true };
    },
  },
  {
    id: 'reach-depth',
    name: 'Reach a depth',
    description: 'The mission is to get 30 blocks below the surface; the player starts at the surface.',
    apply(engine, characterId) {
      engine.setMission(adHocMission('reach-depth', 'Reach depth 30', [{ type: 'REACH_DEPTH', amount: 30 }]));
      moveTo(engine, characterId, 4 * S, engine.surfaceRow);
      return { ok: true };
    },
  },
  {
    id: 'collect-items',
    name: 'Collect five items',
    description: 'The mission is to collect five of the item the most blocks give; the block patches are along the underground line.',
    apply(engine, characterId) {
      const best = engine.dataManager
        .getItems()
        .map((item) => ({ item, drops: engine.dataManager.getBlocksDropping(item.id) }))
        .filter((c) => c.drops.length > 0)
        .sort((a, b) => Math.max(...b.drops.map((d) => d.expectedPerBlock)) - Math.max(...a.drops.map((d) => d.expectedPerBlock)))[0];
      if (!best) return { ok: false, error: 'No block drops an item.' };
      engine.setMission(adHocMission('collect-items', `Collect ${best.item.name}`, [{ type: 'MINE_ITEM', targetId: best.item.id, amount: 5 }]));
      moveTo(engine, characterId, 24 * S, engine.surfaceRow);
      return { ok: true };
    },
  },
];

export const MISSION_SCENE_OPTIONS: readonly SandboxMobOption[] = MISSION_SCENES.map((s) => ({ id: s.id, name: s.name }));

export const findMissionScene = (id: unknown): MissionScene | undefined => MISSION_SCENES.find((s) => s.id === id);
