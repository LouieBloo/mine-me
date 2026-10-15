import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { validateGas, type GasDefinition } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';

/** The columns an admin may set. `typeKey` is only set when a gas is created. */
const EDITABLE_FIELDS = [
  'name', 'description', 'color', 'opacity', 'density', 'diffusionRate', 'minConcentration', 'ventLifetime',
  'appearance', 'flammability', 'generation',
] as const;

const NUMERIC_FIELDS = ['opacity', 'density', 'diffusionRate', 'minConcentration', 'ventLifetime'] as const;

/** Writes the gas table to the dev seed mirror, like the other admin saves do. */
async function mirrorToJson(): Promise<void> {
  const all = await prisma.gas.findMany({ orderBy: { typeKey: 'asc' } });
  syncJson('gases.json', all);
}

/** A Json column takes null as `Prisma.JsonNull`, never a bare null. */
const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): Partial<GasDefinition> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.typeKey === 'string') out.typeKey = body.typeKey;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = Number(value);
  }
  return out as Partial<GasDefinition>;
}

const findGas = (id: string) => prisma.gas.findFirst({ where: { OR: [{ id }, { typeKey: id.toUpperCase() }] } });

export const getGases = async (_req: Request, res: Response) => {
  try {
    res.json(await prisma.gas.findMany({ orderBy: { typeKey: 'asc' } }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch gases' });
  }
};

export const getGas = async (req: Request, res: Response) => {
  try {
    const gas = await findGas(req.params.id);
    if (!gas) {
      res.status(404).json({ error: 'Gas not found' });
      return;
    }
    res.json(gas);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch gas' });
  }
};

export const createGas = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const errors = validateGas(input);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.gas.findUnique({ where: { typeKey: input.typeKey! } })) {
      res.status(409).json({ error: `A gas with the key ${input.typeKey} already exists` });
      return;
    }
    const gas = await prisma.gas.create({
      data: {
        typeKey: input.typeKey!,
        name: input.name!.trim(),
        description: input.description ?? null,
        color: input.color!,
        opacity: input.opacity!,
        density: input.density!,
        diffusionRate: input.diffusionRate!,
        minConcentration: input.minConcentration!,
        ventLifetime: input.ventLifetime!,
        appearance: jsonOrNull(input.appearance),
        flammability: jsonOrNull(input.flammability),
        generation: jsonOrNull(input.generation),
      },
    });
    await mirrorToJson();
    res.status(201).json(gas);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create gas' });
  }
};

export const updateGas = async (req: Request, res: Response) => {
  try {
    const existing = await findGas(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Gas not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.typeKey !== undefined && input.typeKey !== existing.typeKey) {
      res.status(400).json({ error: 'A gas\'s key cannot be changed once it exists' });
      return;
    }
    // Check the gas as it would be after the change, so a partial update cannot leave it invalid
    const merged = { ...existing, ...input } as Partial<GasDefinition>;
    const errors = validateGas(merged);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.GasUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    for (const field of ['color', ...NUMERIC_FIELDS] as const) {
      if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
    }
    if (input.appearance !== undefined) data.appearance = jsonOrNull(input.appearance);
    if (input.flammability !== undefined) data.flammability = jsonOrNull(input.flammability);
    if (input.generation !== undefined) data.generation = jsonOrNull(input.generation);

    const gas = await prisma.gas.update({ where: { id: existing.id }, data });
    await mirrorToJson();
    res.json(gas);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update gas' });
  }
};

/**
 * Deletes a gas. Nothing else references a gas yet (generation settings live on the gas itself);
 * when something does, refuse here while it is in use.
 */
export const deleteGas = async (req: Request, res: Response) => {
  try {
    const existing = await findGas(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Gas not found' });
      return;
    }
    await prisma.gas.delete({ where: { id: existing.id } });
    await mirrorToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete gas' });
  }
};
