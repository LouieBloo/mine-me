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

export const updateSkeleton = async (req: Request, res: Response) => {
  const { manifest } = req.body;
  if (!manifest || !manifest.parts) {
    return res.status(400).json({ error: 'Invalid manifest payload' });
  }

  try {
    const fs = await import('fs');
    const path = await import('path');

    let workspaceRoot = path.resolve(process.cwd());
    while (
      !fs.existsSync(path.join(workspaceRoot, 'packages/shared')) &&
      path.dirname(workspaceRoot) !== workspaceRoot
    ) {
      workspaceRoot = path.dirname(workspaceRoot);
    }

    const manifestPathShared = path.resolve(
      workspaceRoot,
      'packages/shared/assets/sprites/characters/miner/miner_skeleton.json'
    );
    const manifestPathClient = path.resolve(
      workspaceRoot,
      'apps/client/public/assets/sprites/characters/miner/miner_skeleton.json'
    );
    const manifestPathAdmin = path.resolve(
      workspaceRoot,
      'apps/admin/public/assets/sprites/characters/miner/miner_skeleton.json'
    );

    const jsonStr = JSON.stringify(manifest, null, 2);
    if (fs.existsSync(path.dirname(manifestPathShared))) {
      fs.writeFileSync(manifestPathShared, jsonStr, 'utf-8');
    }
    if (fs.existsSync(path.dirname(manifestPathClient))) {
      fs.writeFileSync(manifestPathClient, jsonStr, 'utf-8');
    }
    if (fs.existsSync(path.dirname(manifestPathAdmin))) {
      fs.writeFileSync(manifestPathAdmin, jsonStr, 'utf-8');
    }

    res.json({ success: true, manifest });
  } catch (err: any) {
    console.error('[Admin] Failed to save skeleton manifest:', err);
    res.status(500).json({ error: err.message || 'Failed to save skeleton manifest' });
  }
};
