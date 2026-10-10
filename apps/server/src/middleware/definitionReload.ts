import type { NextFunction, Request, Response } from 'express';
import { DEFINITIONS_RELOAD_FAILED_HEADER } from '@mine-me/shared';
import { reloadDefinitions } from '../services/mining/definitionReloader';

/** Admin route prefixes whose data ends up in the in-memory game definitions. */
export const DEFINITION_ROUTE_PREFIXES = ['/items', '/mobs', '/blocks', '/sounds', '/effects', '/particle-effects'];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const affectsDefinitions = (method: string, path: string): boolean =>
  WRITE_METHODS.has(method) &&
  DEFINITION_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * After a successful admin write to game content, reloads the in-memory definitions BEFORE the
 * response goes out, so "save, then test" never races the reload. If the reload fails the save still
 * succeeded, so the response is unchanged apart from a header the admin app turns into a warning.
 */
export const reloadDefinitionsAfterWrite = (req: Request, res: Response, next: NextFunction): void => {
  if (!affectsDefinitions(req.method, req.path)) return next();

  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
  (res as { end: unknown }).end = (...args: unknown[]): Response => {
    if (res.statusCode >= 400 || res.headersSent) return originalEnd(...args);
    reloadDefinitions()
      .then((result) => {
        if (!result.ok && !res.headersSent) {
          res.setHeader(DEFINITIONS_RELOAD_FAILED_HEADER, '1');
          res.setHeader('Access-Control-Expose-Headers', DEFINITIONS_RELOAD_FAILED_HEADER);
        }
      })
      .catch(() => {})
      .finally(() => originalEnd(...args));
    return res;
  };
  next();
};
