import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest } from '../middleware/auth';

export const charactersRouter = Router();

// ----------------------------------------------------------------------------
// GET /api/characters
// Returns all characters for the authenticated user
// ----------------------------------------------------------------------------
charactersRouter.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.userId;

    const characters = await prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        city: true
      }
    });

    return res.json(characters);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// POST /api/characters
// Creates a new character for the authenticated user
// ----------------------------------------------------------------------------
charactersRouter.post('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.userId;
    const { name, class: charClass } = req.body;

    if (!name || !charClass) {
      return res.status(400).json({ error: 'Name and class are required.' });
    }

    // Check if the user already has an ACTIVE character
    const activeCharacter = await prisma.character.findFirst({
      where: {
        userId: userId!,
        status: 'ACTIVE'
      }
    });

    if (activeCharacter) {
      return res.status(400).json({ error: 'You already have an active character. Retire or lose them before creating a new one.' });
    }

    // Default to a starting city (ensure one exists in your DB or seed)
    const startingCity = await prisma.city.findFirst();
    if (!startingCity) {
        return res.status(500).json({ error: 'No starting city found in the database. Please run seed.' });
    }

    const character = await prisma.character.create({
      data: {
        userId: userId!,
        name,
        class: charClass,
        cityId: startingCity.id,
        level: 1,
        stamina: 100,
        maxStamina: 100,
        status: 'ACTIVE'
      }
    });

    return res.status(201).json(character);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
