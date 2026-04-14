import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest } from '../middleware/auth';

export const gameRouter = Router();
gameRouter.use(authenticateToken);

// ----------------------------------------------------------------------------
// GET /api/game/cities
// Returns a list of all available cities for the UI dropdown.
// ----------------------------------------------------------------------------
gameRouter.get('/cities', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const cities = await prisma.city.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        worldPositionX: true,
        worldPositionY: true,
        mapIconUrl: true
      },
      orderBy: { name: 'asc' }
    });
    return res.json(cities);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/game/city/:cityId
// Returns core city data for the HomeView.
// Security: Verifies the requesting user has an ACTIVE character in that city.
// ----------------------------------------------------------------------------
gameRouter.get('/city/:cityId', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { cityId } = req.params;
    const userId = req.userId!;

    // Verify this user has an active character in the requested city
    const character = await prisma.character.findFirst({
      where: {
        userId,
        cityId,
        status: 'ACTIVE',
      },
      select: { id: true }
    });

    if (!character) {
      return res.status(403).json({ error: 'Forbidden: no active character in this city' });
    }

    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: {
        id: true,
        name: true,
        description: true,
        backgroundImageUrl: true,
      }
    });

    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }

    return res.json(city);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
