import { Request, Response } from 'express';
import { prisma } from '../../index';
import { syncJson, getPagination } from '../../services/admin.service';

export const getCities = async (req: Request, res: Response) => {
  const { skip, take, where } = getPagination(req, 'name');
  const cities = await prisma.city.findMany({ skip, take, where });
  res.json(cities);
};

export const getCity = async (req: Request, res: Response) => {
  const city = await prisma.city.findUnique({ where: { id: req.params.id } });
  res.json(city);
};

export const createCity = async (req: Request, res: Response) => {
  const city = await prisma.city.create({ data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
};

export const updateCity = async (req: Request, res: Response) => {
  const city = await prisma.city.update({ where: { id: req.params.id }, data: req.body });
  const allCities = await prisma.city.findMany();
  syncJson('cities.json', allCities);
  res.json(city);
};
