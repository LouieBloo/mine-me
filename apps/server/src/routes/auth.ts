import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import jwt from 'jsonwebtoken';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

// ----------------------------------------------------------------------------
// POST /auth/signup
// Payload: { phoneNumber: string, familyName: string }
// ----------------------------------------------------------------------------
authRouter.post('/signup', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber, familyName } = req.body;

    if (!phoneNumber || !familyName) {
      return res.status(400).json({ error: 'Phone number and family name are required.' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phoneNumber }, { familyName }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with that phone number or family name already exists.' });
    }

    const user = await prisma.user.create({
      data: {
        phoneNumber,
        familyName,
      }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.json({ user, token });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// POST /auth/login
// Payload: { phoneNumber: string }
// ----------------------------------------------------------------------------
authRouter.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { phoneNumber }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.json({ user, token });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
