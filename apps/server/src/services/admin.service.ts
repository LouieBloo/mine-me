import fs from 'fs';
import path from 'path';
import express from 'express';

const dataPath = path.join(__dirname, '../../../../packages/shared/src/data');

export const syncJson = (filename: string, data: any) => {
  const filePath = path.join(dataPath, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

export const buildDropTableUpsert = (dropTable: any) => {
  if (!dropTable) return undefined;
  return {
    upsert: {
      create: {
        solMin: dropTable.solMin || 0,
        solMax: dropTable.solMax || 0,
        items: {
          create: (dropTable.items || []).map((i: any) => ({
            itemId: i.itemId,
            chance: i.chance,
            minQuantity: i.minQuantity,
            maxQuantity: i.maxQuantity
          }))
        }
      },
      update: {
        solMin: dropTable.solMin || 0,
        solMax: dropTable.solMax || 0,
        items: {
          deleteMany: {},
          create: (dropTable.items || []).map((i: any) => ({
            itemId: i.itemId,
            chance: i.chance,
            minQuantity: i.minQuantity,
            maxQuantity: i.maxQuantity
          }))
        }
      }
    }
  };
};

export const buildDropTableCreate = (dropTable: any) => {
  if (!dropTable) return undefined;
  return {
    create: {
      solMin: dropTable.solMin || 0,
      solMax: dropTable.solMax || 0,
      items: {
        create: (dropTable.items || []).map((i: any) => ({
          itemId: i.itemId,
          chance: i.chance,
          minQuantity: i.minQuantity,
          maxQuantity: i.maxQuantity
        }))
      }
    }
  };
};

export const getPagination = (req: express.Request, searchField: string = 'name') => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = req.query.search as string;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where[searchField] = { contains: search, mode: 'insensitive' };
  }
  
  return { skip, take: limit, where };
};
