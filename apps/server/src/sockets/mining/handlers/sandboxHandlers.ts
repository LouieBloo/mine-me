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
