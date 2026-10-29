import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_MINING_MAP_CONFIG,
  OBJECTIVE_TYPES,
  deriveMissionRequirements,
  describeObjective,
  simulateOffers,
  validateMission,
  type MissionDefinition,
  type MissionRequirements,
} from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';
import { getActiveMiningConfig } from '../../services/miningConfig.service';
import { MiningDataManager, tileTypeForBlockKey } from '../../services/mining/subsystems/MiningDataManager';
import { toMissionDefinition } from '../../services/mining/definitionLoaders';
import { missionLookups, requirementContext } from '../../services/mining/missions/missionContext';

/** The columns an admin may set. `key` is only set when a mission is created; sounds have their own route. */
const EDITABLE_FIELDS = ['name', 'description', 'minLevel', 'maxLevel', 'tier', 'weight', 'objectives', 'rewardCoins', 'rewardXp', 'rewardItems'] as const;
const NUMERIC_FIELDS = ['minLevel', 'maxLevel', 'tier', 'weight', 'rewardCoins', 'rewardXp'] as const;

export const asMissionDefinition = (row: unknown): MissionDefinition => toMissionDefinition(row);

/** Writes the mission table to the dev seed mirror, like the other admin saves do. */
export async function mirrorMissionsToJson(): Promise<void> {
  const all = await prisma.mission.findMany({ orderBy: { key: 'asc' } });
  syncJson('missions.json', all.map(asMissionDefinition));
}

const findMission = (id: string) => prisma.mission.findFirst({ where: { OR: [{ id }, { key: id.toLowerCase() }] } });

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): Partial<MissionDefinition> {
  const out: Record<string, unknown> = {};
  if (body.key !== undefined) out.key = typeof body.key === 'string' ? body.key.trim() : body.key;
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if ((NUMERIC_FIELDS as readonly string[]).includes(field)) out[field] = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    else if (field === 'description') out[field] = typeof value === 'string' && value.trim() === '' ? null : value;
    else out[field] = value;
  }
  return out as Partial<MissionDefinition>;
}

/** The deepest a depth goal may ask for: the active map's height less the margin the tracker keeps. */
async function mapMaxDepth(): Promise<number> {
  const config = await getActiveMiningConfig().catch(() => undefined);
  return (config?.gridHeight ?? DEFAULT_MINING_MAP_CONFIG.gridHeight) - 3;
}

export const getMissions = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.mission.findMany({ orderBy: [{ tier: 'asc' }, { key: 'asc' }] });
    res.json(rows.map(asMissionDefinition));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch missions' });
  }
};

export const getMission = async (req: Request, res: Response) => {
  try {
    const mission = await findMission(req.params.id);
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    res.json(asMissionDefinition(mission));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch mission' });
  }
};

const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

export const createMission = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const draft = { minLevel: 1, maxLevel: 100, tier: 1, weight: 1, rewardCoins: 0, rewardXp: 0, rewardItems: [], ...input } as Partial<MissionDefinition>;
    const errors = validateMission(draft, missionLookups(MiningDataManager.getInstance(), await mapMaxDepth()));
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.mission.findUnique({ where: { key: draft.key! } })) {
      res.status(409).json({ error: `A mission with the key ${draft.key} already exists` });
      return;
    }
    const created = await prisma.mission.create({
      data: {
        key: draft.key!,
        name: draft.name!.trim(),
        description: draft.description ?? null,
        minLevel: draft.minLevel!,
        maxLevel: draft.maxLevel!,
        tier: draft.tier!,
        weight: draft.weight!,
        objectives: draft.objectives as unknown as Prisma.InputJsonValue,
        rewardCoins: draft.rewardCoins ?? 0,
        rewardXp: draft.rewardXp ?? 0,
        rewardItems: jsonOrNull(draft.rewardItems && draft.rewardItems.length > 0 ? draft.rewardItems : null),
      },
    });
    await mirrorMissionsToJson();
    res.status(201).json(asMissionDefinition(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create mission' });
  }
};

export const updateMission = async (req: Request, res: Response) => {
  try {
    const existing = await findMission(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    const merged = { ...asMissionDefinition(existing), ...input, key: existing.key } as MissionDefinition;
    const errors = validateMission(merged, missionLookups(MiningDataManager.getInstance(), await mapMaxDepth()));
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.MissionUpdateInput = {};
    for (const field of EDITABLE_FIELDS) {
      if (input[field] === undefined) continue;
      if (field === 'objectives') data.objectives = merged.objectives as unknown as Prisma.InputJsonValue;
      else if (field === 'rewardItems') data.rewardItems = jsonOrNull(merged.rewardItems.length > 0 ? merged.rewardItems : null);
      else if (field === 'name') data.name = merged.name.trim();
      else (data as Record<string, unknown>)[field] = input[field];
    }
    await prisma.mission.update({ where: { id: existing.id }, data });
    await mirrorMissionsToJson();
    res.json(asMissionDefinition((await findMission(existing.id)) ?? existing));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update mission' });
  }
};

export const deleteMission = async (req: Request, res: Response) => {
  try {
    const existing = await findMission(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    await prisma.mission.delete({ where: { id: existing.id } });
    await mirrorMissionsToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete mission' });
  }
};

/** What the map must hold for objectives, in plain lines for the admin form. */
export function describeRequirements(req: MissionRequirements, data: MiningDataManager): string[] {
  const lines: string[] = [];
  for (const b of req.blocks) lines.push(`At least ${b.minCount} ${(tileTypeForBlockKey(b.typeKey) !== undefined ? data.getBlockConfig(tileTypeForBlockKey(b.typeKey)!)?.name : undefined) ?? b.typeKey} blocks`);
  for (const m of req.mobs) lines.push(`At least ${m.minSpawns} ${m.mobId ? data.getMobData(m.mobId)?.name ?? m.mobId : 'mobs of any kind'} in the caves`);
  for (const f of req.fluids) lines.push(`A pocket of ${data.getFluids().find((x) => x.typeKey === f.typeKey)?.name ?? f.typeKey} (at least ${f.minCells} cells)`);
  for (const g of req.gases) lines.push(`A pocket of ${data.getGases().find((x) => x.typeKey === g.typeKey)?.name ?? g.typeKey} (at least ${g.minCells} cells)`);
  if (req.minDepth > 0) lines.push(`A mine at least ${req.minDepth} blocks deep`);
  return lines;
}

/**
 * Checks a mission draft without saving it: the problems with it, the sentence for each objective and what the map would be made to
 * hold (ticket 110), so the owner sees what the generator guarantees.
 */
export const previewMission = async (req: Request, res: Response) => {
  try {
    const data = MiningDataManager.getInstance();
    const draft = readBody(req.body ?? {});
    const lookups = missionLookups(data, await mapMaxDepth());
    const errors = validateMission({ key: 'preview', name: 'preview', minLevel: 1, maxLevel: 1, tier: 1, weight: 1, rewardItems: [], ...draft }, lookups);
    const objectives = Array.isArray(draft.objectives) ? draft.objectives : [];
    const usable = objectives.filter((o) => o && OBJECTIVE_TYPES[o.type as keyof typeof OBJECTIVE_TYPES]);
    const requirements = deriveMissionRequirements(usable, requirementContext(data));
    res.json({ errors, labels: usable.map((o) => describeObjective(o, lookups)), requirements, lines: describeRequirements(requirements, data) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check the mission' });
  }
};

/** Which missions a character of a level would be offered, and how often over many rolls (the admin's simulation tool). */
export const simulateMissionOffers = async (req: Request, res: Response) => {
  try {
    const level = Number(req.body?.level ?? req.query.level);
    const rolls = Math.min(5000, Math.max(1, Number(req.body?.rolls ?? req.query.rolls ?? 1000)));
    if (!Number.isInteger(level) || level < 1) {
      res.status(400).json({ error: 'level must be a whole number of at least 1' });
      return;
    }
    const rows = await prisma.mission.findMany({ orderBy: { key: 'asc' } });
    const missions = rows.map(asMissionDefinition);
    const shares = simulateOffers(missions, level, rolls, Math.random);
    res.json({
      level,
      rolls,
      missions: missions.map((m) => ({ id: m.id, key: m.key, name: m.name, tier: m.tier, share: shares.get(m) ?? 0, eligible: m.minLevel <= level && level <= m.maxLevel })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to simulate the offers' });
  }
};
