import { Request, Response } from 'express';
import { prisma } from '../../index';
import { getPagination } from '../../services/admin.service';

export const getUsers = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'familyName');
  const users = await prisma.user.findMany({ skip, take, where });
  res.json(users);
};

export const getUser = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.json(user);
};

export const createUser = async (req: Request, res: Response) => {
  const user = await prisma.user.create({ data: req.body });
  res.json(user);
};

export const updateUser = async (req: Request, res: Response) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
  res.json(user);
};
