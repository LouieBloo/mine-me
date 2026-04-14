import type { GameCity } from '../types';

/**
 * Calculates the travel distance in days between two cities.
 * Based on Euclidean distance: Math.ceil(Math.sqrt(dx^2 + dy^2))
 * 
 * @param cityA The starting city
 * @param cityB The destination city
 * @returns The number of days (always at least 1 if cities are different)
 */
export const calculateTravelDays = (cityA: Partial<GameCity>, cityB: Partial<GameCity>): number => {
  if (cityA.id === cityB.id) return 0;
  
  const x1 = cityA.worldPositionX ?? 50;
  const y1 = cityA.worldPositionY ?? 50;
  const x2 = cityB.worldPositionX ?? 50;
  const y2 = cityB.worldPositionY ?? 50;

  const dx = x2 - x1;
  const dy = y2 - y1;
  
  return Math.ceil(Math.sqrt(dx * dx + dy * dy));
};
