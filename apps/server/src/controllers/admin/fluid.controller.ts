import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { validateFluid, type FluidDefinition } from '@mine-me/shared';
import { prisma } from '../../index';
import { syncJson } from '../../services/admin.service';

/** The columns an admin may set. `typeKey` is only set when a fluid is created. */
const EDITABLE_FIELDS = [
  'name', 'description', 'color', 'opacity', 'density', 'viscosity', 'flowRate', 'minLevel', 'flowThreshold',
  'flammability', 'generation',
] as const;

const NUMERIC_FIELDS = ['opacity', 'density', 'viscosity', 'flowRate', 'minLevel', 'flowThreshold'] as const;

/** Writes the fluid table to the dev seed mirror, like the other admin saves do. */
async function mirrorToJson(): Promise<void> {
  const all = await prisma.fluid.findMany({ orderBy: { typeKey: 'asc' } });
  syncJson('fluids.json', all);
}

/** A Json column takes null as `Prisma.JsonNull`, never a bare null. */
const jsonOrNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/** Numbers arrive as numbers or numeric strings; anything else is left for validation to reject. */
function readBody(body: Record<string, unknown>): Partial<FluidDefinition> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) out[field] = body[field];
  if (typeof body.typeKey === 'string') out.typeKey = body.typeKey;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && value.trim() !== '') out[field] = Number(value);
  }
  return out as Partial<FluidDefinition>;
}

const findFluid = (id: string) => prisma.fluid.findFirst({ where: { OR: [{ id }, { typeKey: id.toUpperCase() }] } });

export const getFluids = async (_req: Request, res: Response) => {
  try {
    res.json(await prisma.fluid.findMany({ orderBy: { typeKey: 'asc' } }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch fluids' });
  }
};

export const getFluid = async (req: Request, res: Response) => {
  try {
    const fluid = await findFluid(req.params.id);
    if (!fluid) {
      res.status(404).json({ error: 'Fluid not found' });
      return;
    }
    res.json(fluid);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch fluid' });
  }
};

export const createFluid = async (req: Request, res: Response) => {
  try {
    const input = readBody(req.body ?? {});
    const errors = validateFluid(input);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    if (await prisma.fluid.findUnique({ where: { typeKey: input.typeKey! } })) {
      res.status(409).json({ error: `A fluid with the key ${input.typeKey} already exists` });
      return;
    }
    const fluid = await prisma.fluid.create({
      data: {
        typeKey: input.typeKey!,
        name: input.name!.trim(),
        description: input.description ?? null,
        color: input.color!,
        opacity: input.opacity!,
        density: input.density!,
        viscosity: input.viscosity!,
        flowRate: input.flowRate!,
        minLevel: input.minLevel!,
        flowThreshold: input.flowThreshold!,
        flammability: jsonOrNull(input.flammability),
        generation: jsonOrNull(input.generation),
      },
    });
    await mirrorToJson();
    res.status(201).json(fluid);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create fluid' });
  }
};

export const updateFluid = async (req: Request, res: Response) => {
  try {
    const existing = await findFluid(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Fluid not found' });
      return;
    }
    const input = readBody(req.body ?? {});
    if (input.typeKey !== undefined && input.typeKey !== existing.typeKey) {
      res.status(400).json({ error: 'A fluid\'s key cannot be changed once it exists' });
      return;
    }
    // Check the fluid as it would be after the change, so a partial update cannot leave it invalid
    const merged = { ...existing, ...input } as Partial<FluidDefinition>;
    const errors = validateFluid(merged);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; '), errors });
      return;
    }
    const data: Prisma.FluidUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    for (const field of ['color', ...NUMERIC_FIELDS] as const) {
      if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
    }
    if (input.flammability !== undefined) data.flammability = jsonOrNull(input.flammability);
    if (input.generation !== undefined) data.generation = jsonOrNull(input.generation);

    const fluid = await prisma.fluid.update({ where: { id: existing.id }, data });
    await mirrorToJson();
    res.json(fluid);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update fluid' });
  }
};

/**
 * Deletes a fluid. Nothing else references a fluid yet (generation settings live on the fluid itself);
 * when something does, refuse here while it is in use.
 */
export const deleteFluid = async (req: Request, res: Response) => {
  try {
    const existing = await findFluid(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Fluid not found' });
      return;
    }
    await prisma.fluid.delete({ where: { id: existing.id } });
    await mirrorToJson();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete fluid' });
  }
};
