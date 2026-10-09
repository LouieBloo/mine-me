import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';

export const getEffects = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const effects = await prisma.effect.findMany({ skip, take, where });
  res.json(effects);
};

export const getEffect = async (req: Request, res: Response) => {
  const effect = await prisma.effect.findUnique({
    where: { id: req.params.id }
  });
  res.json(effect);
};

/** Every boolean flag that says what an effect does. Add new kinds of effect here. */
const EFFECT_FLAGS = [
  'healthGain',
  'staminaGain',
  'miningSpeedModifier',
  'damageModifier',
  'toolDamageModifier',
  'pickPowerModifier',
  'knockbackModifier',
  'explodes',
] as const;

const parseEffectFlags = (body: Record<string, unknown>) =>
  Object.fromEntries(EFFECT_FLAGS.map((flag) => [flag, body[flag] === true || body[flag] === 'true']));

export const createEffect = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const effect = await prisma.effect.create({
      data: { name, description, ...parseEffectFlags(req.body) }
    });

    const allEffects = await prisma.effect.findMany();
    syncJson('effects.json', allEffects);

    res.json(effect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create effect' });
  }
};

export const updateEffect = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const effect = await prisma.effect.update({
      where: { id: req.params.id },
      data: { name, description, ...parseEffectFlags(req.body) }
    });

    const allEffects = await prisma.effect.findMany();
    syncJson('effects.json', allEffects);

    res.json(effect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update effect' });
  }
};

export const deleteEffect = async (req: Request, res: Response) => {
  try {
    const effect = await prisma.effect.delete({
      where: { id: req.params.id }
    });

    const allEffects = await prisma.effect.findMany();
    syncJson('effects.json', allEffects);

    res.json(effect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete effect' });
  }
};
