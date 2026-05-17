import { Request, Response } from 'express';
import { prisma } from '../../index';
import { getPagination } from '../../services/admin.service';

export const getCharacters = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const items = await prisma.character.findMany({ skip, take, where });
  res.json(items);
};

export const getCharacter = async (req: Request, res: Response) => {
  const item = await prisma.character.findUnique({ where: { id: req.params.id } });
  res.json(item);
};

export const updateCharacter = async (req: Request, res: Response) => {
  const { 
    name, class: characterClass, profession, status, 
    experience, combatScore, defenseScore, stamina, maxStamina, 
    maxInventorySlots, ageInDays, sol, lear 
  } = req.body;

  try {
    const updated = await prisma.character.update({
      where: { id: req.params.id },
      data: {
        name,
        class: characterClass,
        profession,
        status,
        experience,
        combatScore,
        defenseScore,
        stamina,
        maxStamina,
        maxInventorySlots,
        ageInDays,
        sol,
        lear,
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update character' });
  }
};
