import { useCallback, useEffect, useState } from 'react';
import type { SoundTrack } from '@mine-me/shared';
import { useApi } from './useApi';
import { useToast } from '../contexts/ToastContext';

/** The sound library (every uploaded sound), loaded on mount when `enabled`; `reload` refreshes it. */
export function useSoundLibrary(enabled: boolean = true) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [library, setLibrary] = useState<SoundTrack[]>([]);
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/admin/sounds');
      if (!res.ok) throw new Error('Failed to load the sound library');
      const sounds = await res.json();
      setLibrary(Array.isArray(sounds) ? sounds : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load the sound library');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, toast]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled]);

  return { library, loading, reload };
}
