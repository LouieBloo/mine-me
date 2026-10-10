import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { getAssetUrl } from '@mine-me/shared';
import { FILTERS, matchesFilter, type Filter, type SoundRow } from './soundFilters';
import { UploadSoundModal } from './UploadSoundModal/UploadSoundModal';
import './Music.css';

export default function Music() {
  const [tracks, setTracks] = useState<SoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [syncing, setSyncing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toast = useToast();
  const { fetchWithAuth } = useApi();

  const fetchTracks = () => {
    setLoading(true);
    fetchWithAuth('/api/admin/sounds')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch sound tracks');
        return res.json();
      })
      .then((data: SoundRow[]) => {
        setTracks(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message || 'Failed to load tracks');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const visibleTracks = tracks.filter((t) => matchesFilter(t, filter));

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetchWithAuth('/api/admin/sounds/sync', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to sync the sound library');
      }
      const report = await res.json();
      const added = report.added?.length ?? 0;
      const missing = report.missing?.length ?? 0;
      toast.success(
        `${added} new sound${added === 1 ? '' : 's'} added to the library` +
          (missing > 0 ? `; ${missing} library entr${missing === 1 ? 'y has' : 'ies have'} no file on disk` : '')
      );
      if (added > 0) fetchTracks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync the sound library');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleActive = async (track: SoundRow) => {
    const newActive = !track.isActive;
    // Optimistic update
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isActive: newActive } : t));

    try {
      const res = await fetchWithAuth(`/api/admin/sounds/${track.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newActive }),
      });

      if (!res.ok) {
        throw new Error('Failed to update track status');
      }

      toast.success(`Track "${track.name}" ${newActive ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      // Revert optimistic update
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isActive: !newActive } : t));
      toast.error(err.message || 'Update failed');
    }
  };

  const handleDelete = async (track: SoundRow) => {
    if (!window.confirm(`Are you sure you want to delete track "${track.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(track.id);
    try {
      const res = await fetchWithAuth(`/api/admin/sounds/${track.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to delete sound track');
      }

      setTracks(prev => prev.filter(t => t.id !== track.id));
      toast.success(`Track "${track.name}" deleted successfully`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete track');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="music-page space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MUSIC & SOUNDS</h2>
          <p className="text-slate-500 font-medium">Manage background music playlists, ambient audio, and sound effects.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Add any sound files found on disk that are not in the library yet"
            className="cursor-pointer px-5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <LoadingSpinner size={16} /> : <span>🔄</span>}
            <span>{syncing ? 'Syncing...' : 'Sync from disk'}</span>
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="cursor-pointer px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-2"
          >
            <span>🎵</span>
            <span>Upload Sound Track</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`cursor-pointer px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              filter === key
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {label} ({tracks.filter((t) => matchesFilter(t, key)).length})
          </button>
        ))}
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <LoadingSpinner size={60} />
          </div>
        ) : visibleTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl mb-3">
              🎧
            </div>
            <h3 className="text-base font-bold text-slate-800">No audio tracks found</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              Upload your first background music or sound effect track to add audio to the game.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all"
            >
              Upload Track
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">Preview Player</th>
                  <th className="py-4 px-6">Track Info</th>
                  <th className="py-4 px-6">Type</th>
                  <th className="py-4 px-6">Used By</th>
                  <th className="py-4 px-6">File Size</th>
                  <th className="py-4 px-6">Preset Vol</th>
                  <th className="py-4 px-6">Active</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleTracks.map((track) => (
                  <tr key={track.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Audio Player Preview */}
                    <td className="py-4 px-6">
                      <audio
                        controls
                        preload="none"
                        src={getAssetUrl(track.url)}
                        className="rounded"
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </td>

                    {/* Track Info */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-900 text-sm">{track.name}</div>
                      {track.description && (
                        <div className="text-xs text-slate-500 truncate max-w-xs">{track.description}</div>
                      )}
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{track.fileName}</div>
                    </td>

                    {/* Type Badge */}
                    <td className="py-4 px-6">
                      <span
                        className={`inline-block px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${
                          track.type === 'BGM'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {track.type}
                      </span>
                      {track.type === 'SFX' && (
                        <span className="ml-1.5 inline-block px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-slate-100 text-slate-600">
                          {track.category ?? 'GENERAL'}
                        </span>
                      )}
                    </td>

                    {/* Used By */}
                    <td className="py-4 px-6 text-xs text-slate-600 max-w-xs">
                      {track.usedBy && track.usedBy.length > 0 ? (
                        <ul className="space-y-0.5">
                          {track.usedBy.map((u) => (
                            <li key={u} className="truncate" title={u}>{u}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">Not used</span>
                      )}
                    </td>

                    {/* File Size */}
                    <td className="py-4 px-6 text-slate-600 font-medium text-xs">
                      {formatFileSize(track.fileSize)}
                    </td>

                    {/* Volume */}
                    <td className="py-4 px-6 text-slate-600 font-bold text-xs">
                      {Math.round(track.volume * 100)}%
                    </td>

                    {/* Active Toggle Switch */}
                    <td className="py-4 px-6">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(track)}
                        className={`cursor-pointer relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          track.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={track.isActive ? 'Active (Click to disable)' : 'Inactive (Click to enable)'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            track.isActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDelete(track)}
                        disabled={deletingId === track.id}
                        className="cursor-pointer px-3 py-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 font-bold text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === track.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadSoundModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => fetchTracks()}
      />
    </div>
  );
}
