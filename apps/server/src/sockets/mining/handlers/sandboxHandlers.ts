import { Server, Socket } from 'socket.io';
import type { GameEventResult, SandboxStatus } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import type { MiningGameEngine } from '../../../services/mining/MiningGameEngine';
import type { SandboxTools, SandboxResult } from '../../../services/mining/sandbox/SandboxTools';

type SandboxContext = { characterId: string; engine: MiningGameEngine; tools: SandboxTools };

/**
 * Finds the sandbox the caller is in. The sandbox tools are test tools: every command is refused
 * outside a sandbox room, whoever sends it.
 */
function sandboxFor(socket: Socket): SandboxContext | GameEventResult {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };
  const engine = miningSessionManager.getSession(characterId);
  if (!engine || !engine.getPlayer(characterId)) return { success: false, error: 'No active mining session.' };
  if (!engine.sandbox) return { success: false, error: 'Sandbox tools are only available in the sandbox.' };
  return { characterId, engine, tools: engine.sandbox };
}

const isContext = (v: SandboxContext | GameEventResult): v is SandboxContext => 'tools' in v;

const toResult = (res: SandboxResult<object>, data?: Record<string, unknown>): GameEventResult =>
  res.ok ? { success: true, data } : { success: false, error: res.error };

const statusData = (ctx: SandboxContext): { status: SandboxStatus } => ({ status: ctx.tools.status(ctx.characterId) });

export const handleSandboxPourFluid = async (
  _io: Server,
  socket: Socket,
  payload: { x?: unknown; y?: unknown; fluidKey?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.pourFluid(payload?.x, payload?.y, payload?.fluidKey));
};

export const handleSandboxReleaseGas = async (
  _io: Server,
  socket: Socket,
  payload: { x?: unknown; y?: unknown; gasKey?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.releaseGas(payload?.x, payload?.y, payload?.gasKey));
};

export const handleSandboxSpawnMob = async (
  _io: Server,
  socket: Socket,
  payload: { mobId?: unknown; x?: unknown; y?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.spawnMob(payload?.mobId, payload?.x, payload?.y));
};

export const handleSandboxIgnite = async (
  _io: Server,
  socket: Socket,
  payload: { x?: unknown; y?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.ignite(payload?.x, payload?.y));
};

export const handleSandboxClearHazards = async (_io: Server, socket: Socket): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  ctx.tools.clearHazards();
  return { success: true };
};

export const handleSandboxSetGodMode = async (
  _io: Server,
  socket: Socket,
  payload: { enabled?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.setGodMode(ctx.characterId, payload?.enabled);
  return toResult(res, res.ok ? statusData(ctx) : undefined);
};

export const handleSandboxSetSim = async (
  _io: Server,
  socket: Socket,
  payload: { paused?: unknown; speed?: unknown; step?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.setSim({ paused: payload?.paused, speed: payload?.speed, step: payload?.step });
  return toResult(res, res.ok ? statusData(ctx) : undefined);
};

export const handleSandboxReset = async (_io: Server, socket: Socket): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  if (!miningSessionManager.resetSandbox(ctx.characterId)) return { success: false, error: 'Could not reset the sandbox.' };
  return { success: true };
};

/** Puts the extractor in the room and lets everyone's view rebuild so they can see it. */
export const handleSandboxSpawnExtractor = async (_io: Server, socket: Socket): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.spawnExtractor();
  if (res.ok) miningSessionManager.sendSandboxState(ctx.engine, { title: 'Extractor', message: 'An extractor is landing.' });
  return toResult(res);
};

export const handleSandboxDigBelt = async (_io: Server, socket: Socket, payload: { rows?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.digBelt(payload?.rows);
  return toResult(res, res.ok ? { laid: res.laid } : undefined);
};

export const handleSandboxSetCapacity = async (_io: Server, socket: Socket, payload: { capacity?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.setCapacity(ctx.characterId, payload?.capacity));
};

export const handleSandboxFillBackpack = async (
  _io: Server,
  socket: Socket,
  payload: { itemId?: unknown; quantity?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.fillBackpack(ctx.characterId, payload?.itemId, payload?.quantity));
};

/** Loads a named extractor test scene; the view is rebuilt so the new belt shows. */
export const handleSandboxLoadExtractorScene = async (_io: Server, socket: Socket, payload: { sceneId?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.loadExtractorScene(ctx.characterId, payload?.sceneId);
  if (res.ok) miningSessionManager.sendSandboxState(ctx.engine, { title: 'Scene loaded', message: 'The extractor scene is ready.' });
  return toResult(res);
};

export const handleSandboxPlaceDoodad = async (
  _io: Server,
  socket: Socket,
  payload: { doodadId?: unknown; x?: unknown; y?: unknown },
): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.placeDoodad(payload?.doodadId, payload?.x, payload?.y));
};

export const handleSandboxRemoveDoodad = async (_io: Server, socket: Socket, payload: { x?: unknown; y?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.removeDoodad(payload?.x, payload?.y));
};

export const handleSandboxHitDoodad = async (_io: Server, socket: Socket, payload: { x?: unknown; y?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.hitDoodad(payload?.x, payload?.y));
};

export const handleSandboxClearDoodads = async (_io: Server, socket: Socket): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  ctx.tools.clearDoodads();
  return { success: true };
};

/** Turns the doodad pass on or off and rebuilds the map so it shows (everyone in the room gets the fresh state). */
export const handleSandboxSetDoodadGeneration = async (_io: Server, socket: Socket, payload: { enabled?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.setDoodadGeneration(payload?.enabled);
  if (!res.ok) return toResult(res);
  if (!miningSessionManager.resetSandbox(ctx.characterId)) return { success: false, error: 'Could not rebuild the sandbox.' };
  return toResult(res, statusData(ctx));
};

/** Loads a named doodad scene; the view is rebuilt so the player is where the scene put them. */
export const handleSandboxLoadDoodadScene = async (_io: Server, socket: Socket, payload: { sceneId?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.loadDoodadScene(ctx.characterId, payload?.sceneId);
  if (res.ok) miningSessionManager.sendSandboxState(ctx.engine, { title: 'Scene loaded', message: `${res.placed} doodads placed.` });
  return toResult(res, res.ok ? { placed: res.placed } : undefined);
};

/** Starts a mission on the sandbox map: a loaded one by id, or a one-off list of objectives. */
export const handleSandboxStartMission = async (_io: Server, socket: Socket, payload: { missionId?: unknown; objectives?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.startMission(payload?.missionId, payload?.objectives));
};

/** Completes the sandbox mission now, restarts it, or drops it. */
export const handleSandboxMissionControl = async (_io: Server, socket: Socket, payload: { action?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.missionControl(payload?.action));
};

/** Loads a named mission test scene; the view is rebuilt so the player is where the scene put them. */
export const handleSandboxLoadMissionScene = async (_io: Server, socket: Socket, payload: { sceneId?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  const res = ctx.tools.loadMissionScene(ctx.characterId, payload?.sceneId);
  if (res.ok) miningSessionManager.sendSandboxState(ctx.engine, { title: 'Scene loaded', message: 'The mission has started.' });
  return toResult(res);
};

/** Swaps the surface environment (by key) for everyone in the room. */
export const handleSandboxSetSurfaceEnvironment = async (_io: Server, socket: Socket, payload: { key?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.setSurfaceEnvironment(payload?.key), statusData(ctx));
};

/** Forces a weather state at a strength (null: back to the seeded weather). */
export const handleSandboxSetWeather = async (_io: Server, socket: Socket, payload: { weather?: unknown; intensity?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.setWeather(payload?.weather ?? null, payload?.intensity), statusData(ctx));
};

/** Calls a lightning strike now. */
export const handleSandboxTriggerLightning = async (_io: Server, socket: Socket): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.triggerLightning());
};

/** Loads a named surface scene (clear day, heavy rain, storm...). */
export const handleSandboxLoadSurfaceScene = async (_io: Server, socket: Socket, payload: { sceneId?: unknown }): Promise<GameEventResult> => {
  const ctx = sandboxFor(socket);
  if (!isContext(ctx)) return ctx;
  return toResult(ctx.tools.loadSurfaceScene(payload?.sceneId), statusData(ctx));
};
