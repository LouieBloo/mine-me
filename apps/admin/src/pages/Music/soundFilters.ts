import type { SoundCategory, SoundTrack } from '@mine-me/shared';

export type SoundRow = SoundTrack & { usedBy?: string[] };
export type Filter = 'ALL' | 'BGM' | SoundCategory;

export const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All Sounds' },
  { key: 'BGM', label: 'Music (BGM)' },
  { key: 'MOB', label: 'Mob SFX' },
  { key: 'ITEM', label: 'Item SFX' },
  { key: 'BLOCK', label: 'Block SFX' },
  { key: 'GENERAL', label: 'Other SFX' },
];

export const matchesFilter = (track: SoundTrack, filter: Filter): boolean => {
  if (filter === 'ALL') return true;
  if (filter === 'BGM') return track.type === 'BGM';
  return track.type === 'SFX' && (track.category ?? 'GENERAL') === filter;
};
