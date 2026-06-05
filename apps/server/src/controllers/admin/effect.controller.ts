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

export const createEffect = async (req: Request, res: Response) => {
  try {
    const { name, description, healthGain, staminaGain } = req.body;
    const effect = await prisma.effect.create({
      data: {
        name,
        description,
        healthGain: healthGain === true || healthGain === 'true',
        staminaGain: staminaGain === true || staminaGain === 'true'
      }
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
    const { name, description, healthGain, staminaGain } = req.body;
    const effect = await prisma.effect.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        healthGain: healthGain === true || healthGain === 'true',
        staminaGain: staminaGain === true || staminaGain === 'true'
      }
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
