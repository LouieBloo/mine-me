import fs from 'fs';
import path from 'path';
import type { PrismaClient, SoundCategory } from '@prisma/client';

type SoundDb = Pick<PrismaClient, 'sound'>;

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

/** Folder under assets/sounds -> library category. Files directly in assets/sounds are GENERAL. */
const FOLDER_CATEGORY: Record<string, SoundCategory> = { items: 'ITEM', blocks: 'BLOCK', mobs: 'MOB' };

export const isAudioFile = (fileName: string): boolean => path.extname(fileName).toLowerCase() in AUDIO_MIME;

export const mimeForFile = (fileName: string): string => AUDIO_MIME[path.extname(fileName).toLowerCase()] ?? 'audio/mpeg';

export function categoryForUrl(url: string): SoundCategory {
  const [folder, rest] = url.replace(/^\/?assets\/sounds\//, '').split('/');
  return rest !== undefined && FOLDER_CATEGORY[folder] ? FOLDER_CATEGORY[folder] : 'GENERAL';
}

/** The sound's display name: the uploaded file's own name without its extension, exactly as given. */
export const soundNameFromFile = (originalName: string): string =>
  path.basename(originalName, path.extname(originalName)).trim() || originalName;

/**
 * A safe, unique file name for an uploaded sound that keeps the file's own name: spaces and odd
 * characters become `_` (so urls never need escaping), case is kept, and a clash with an existing
 * file gets `-2`, `-3`... rather than overwriting it. Nothing about what the sound is attached to
 * ever goes in the name.
 */
export function uniqueSoundFileName(dir: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const base =
    path
      .basename(originalName, path.extname(originalName))
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, 80) || 'sound';
  let candidate = `${base}${ext}`;
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

export interface RegisterSoundFile {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  category: SoundCategory;
  /** Defaults to the file's own name without its extension. */
  name?: string;
}

/**
 * Makes sure a sound file found on disk has a library row, keyed by its url. Used by Sync and the
 * backfill script; uploads create their row directly in the library upload.
 */
export async function registerSoundFile(db: SoundDb, file: RegisterSoundFile) {
  const existing = await db.sound.findFirst({ where: { url: file.url } });
  if (existing) {
    return db.sound.update({
      where: { id: existing.id },
      data: { fileSize: file.fileSize, mimeType: file.mimeType ?? mimeForFile(file.fileName) },
    });
  }
  return db.sound.create({
    data: {
      name: file.name ?? soundNameFromFile(file.fileName),
      type: 'SFX',
      category: file.category,
      url: file.url,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType ?? mimeForFile(file.fileName),
      volume: 1,
      loop: false,
      isActive: true,
    },
  });
}

function listAudioFiles(dir: string, urlPrefix: string): { url: string; fileName: string; fileSize: number }[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listAudioFiles(path.join(dir, entry.name), `${urlPrefix}/${entry.name}`);
    if (!entry.isFile() || !isAudioFile(entry.name)) return [];
    return [{ url: `${urlPrefix}/${entry.name}`, fileName: entry.name, fileSize: fs.statSync(path.join(dir, entry.name)).size }];
  });
}

export interface SyncReport {
  /** Audio files on disk that had no library row (registered unless `dryRun`). */
  added: { url: string; category: SoundCategory }[];
  /** Library rows whose file is no longer on disk (reported only; never deleted automatically). */
  missing: { id: string; name: string; url: string }[];
}

/**
 * Compares the sounds folder with the library. Files with no row are registered as sound effects
 * in the category their folder implies; rows with no file are reported, not removed.
 */
export async function syncSoundLibrary(
  db: SoundDb,
  soundsDir: string,
  options: { dryRun?: boolean } = {}
): Promise<SyncReport> {
  const files = listAudioFiles(soundsDir, '/assets/sounds');
  const rows = await db.sound.findMany({ select: { id: true, name: true, url: true } });
  const known = new Set(rows.map((r) => r.url));
  const onDisk = new Set(files.map((f) => f.url));

  const added: SyncReport['added'] = [];
  for (const file of files) {
    if (known.has(file.url)) continue;
    const category = categoryForUrl(file.url);
    added.push({ url: file.url, category });
    if (!options.dryRun) await registerSoundFile(db, { ...file, category });
  }
  return { added, missing: rows.filter((r) => !onDisk.has(r.url)) };
}
