import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';

export const getParticleEffects = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const particleEffects = await prisma.particleEffect.findMany({
    skip,
    take,
    where,
    include: {
      items: {
        select: {
          id: true,
          name: true,
          iconUrl: true
        }
      }
    }
  });
  res.json(particleEffects);
};

export const getParticleEffect = async (req: Request, res: Response) => {
  const particleEffect = await prisma.particleEffect.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        select: {
          id: true,
          name: true,
          iconUrl: true
        }
      }
    }
  });
  if (!particleEffect) {
    res.status(404).json({ error: 'Particle effect not found' });
    return;
  }
  res.json(particleEffect);
};

export const createParticleEffect = async (req: Request, res: Response) => {
  try {
    const { name, description, type, config } = req.body;
    const particleEffect = await prisma.particleEffect.create({
      data: {
        name,
        description,
        type: type || 'CONTINUOUS',
        config: typeof config === 'string' ? JSON.parse(config) : config
      }
    });

    const allEffects = await prisma.particleEffect.findMany();
    syncJson('particle_effects.json', allEffects);

    res.json(particleEffect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create particle effect' });
  }
};

export const updateParticleEffect = async (req: Request, res: Response) => {
  try {
    const { name, description, type, config } = req.body;
    const particleEffect = await prisma.particleEffect.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        type: type || 'CONTINUOUS',
        config: typeof config === 'string' ? JSON.parse(config) : config
      }
    });

    const allEffects = await prisma.particleEffect.findMany();
    syncJson('particle_effects.json', allEffects);

    res.json(particleEffect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update particle effect' });
  }
};

export const deleteParticleEffect = async (req: Request, res: Response) => {
  try {
    const particleEffect = await prisma.particleEffect.delete({
      where: { id: req.params.id }
    });

    const allEffects = await prisma.particleEffect.findMany();
    syncJson('particle_effects.json', allEffects);

    res.json(particleEffect);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete particle effect' });
  }
};
