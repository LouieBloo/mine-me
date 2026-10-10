import path from 'path';

const DEFAULT_SHARED_ROOT = path.join(__dirname, '../../../../packages/shared');

/**
 * Root of the shared package that `/assets/...` urls resolve against. Read on every call so tests
 * can point it at a temp folder via SHARED_ROOT and never write into the real asset folders.
 */
export const getSharedRoot = (): string => process.env.SHARED_ROOT || DEFAULT_SHARED_ROOT;

export const getAssetsRoot = (): string => path.join(getSharedRoot(), 'assets');

export const getSoundsDir = (...sub: string[]): string => path.join(getAssetsRoot(), 'sounds', ...sub);

/** Absolute file path for a served `/assets/...` url. */
export const resolveAssetUrl = (url: string): string => path.join(getSharedRoot(), url);
