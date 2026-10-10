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

const readableName = (fileName: string): string =>
  path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, ' ').trim() || fileName;

export interface RegisterSoundFile {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  category: SoundCategory;
  /** Defaults to a readable form of the file name. */
  name?: string;
}

/**
 * Makes sure a sound file has a library row, keyed by its url (uploads overwrite the same file
 * name, so the row is updated rather than duplicated). Sound effects only; music has its own upload.
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
      name: file.name ?? readableName(file.fileName),
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

/** Removes the library row for a url (the file itself is the caller's to delete). */
export async function unregisterSoundFile(db: SoundDb, url: string) {
  return db.sound.deleteMany({ where: { url } });
}

/** Library bookkeeping must never fail an upload; Sync repairs anything this misses. */
export async function tryRegisterSoundFile(db: SoundDb, file: RegisterSoundFile): Promise<void> {
  try {
    await registerSoundFile(db, file);
  } catch (err) {
    console.warn('[SoundLibrary] Could not register sound file:', file.url, err);
  }
}

export async function tryUnregisterSoundFile(db: SoundDb, url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await unregisterSoundFile(db, url);
  } catch (err) {
    console.warn('[SoundLibrary] Could not remove sound row:', url, err);
  }
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
