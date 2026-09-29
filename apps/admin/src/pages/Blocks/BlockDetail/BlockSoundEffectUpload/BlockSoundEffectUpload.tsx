import React, { useState, useRef } from 'react';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import { getAssetUrl } from '@mine-me/shared';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './BlockSoundEffectUpload.css';

interface BlockSoundEffectUploadProps {
  blockId: string;
  soundEffectUrl?: string | null;
  blockName?: string;
  onUploadSuccess: (updatedBlock: any) => void;
}

export default function BlockSoundEffectUpload({
  blockId,
  soundEffectUrl,
  blockName,
  onUploadSuccess,
}: BlockSoundEffectUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showUpload, setShowUpload] = useState(!soundEffectUrl);
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPendingFile(null);
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        setPendingPreviewUrl(null);
      }
      return;
    }

    const allowedExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];
    const hasAudioType = file.type.startsWith('audio/') || allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!hasAudioType) {
      toast.error('Only audio files (.mp3, .wav, .ogg, .webm, .m4a, .aac, .flac) are allowed.');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Audio file must be less than 20MB.');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('soundEffect', pendingFile);

      const res = await fetchWithAuth(`/api/admin/blocks/${blockId}/sound-effect`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload block sound effect');
      }

      const updatedBlock = await res.json();
      onUploadSuccess(updatedBlock);
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        setPendingPreviewUrl(null);
      }
      setPendingFile(null);
      setShowUpload(false);
      toast.success('Block damage sound effect updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload block sound effect');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove the sound effect from this block?')) {
      return;
    }

    setRemoving(true);
    try {
      const res = await fetchWithAuth(`/api/admin/blocks/${blockId}/sound-effect`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove block sound effect');
      }

      const updatedBlock = await res.json();
      onUploadSuccess(updatedBlock);
      setShowUpload(true);
      setPendingFile(null);
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        setPendingPreviewUrl(null);
      }
      toast.success('Block sound effect removed successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove block sound effect');
    } finally {
      setRemoving(false);
    }
  };

  const fullAudioUrl = soundEffectUrl ? getAssetUrl(soundEffectUrl) : null;

  return (
    <div className="block-sound-effect-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-6">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
            <span>Damage Sound Effect</span>
            <span className="text-amber-400 text-base">🔊</span>
          </h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
            Plays in-game when {blockName || 'this block'} is damaged or mined (MP3, WAV, OGG, WEBM)
          </p>
        </div>
        {!showUpload && soundEffectUrl && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="cursor-pointer px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all border border-white/20"
          >
            Update Sound
          </button>
        )}
      </div>

      <div className="p-8">
        {showUpload ? (
          <div className="space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                pendingFile ? 'border-amber-400 bg-amber-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
              }`}
            >
              <svg
                className={`w-10 h-10 mb-2 ${pendingFile ? 'text-amber-500' : 'text-slate-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <span className="text-sm font-black uppercase text-slate-600">
                {pendingFile ? pendingFile.name : 'Select Block Damage Audio File'}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                {pendingFile
                  ? `${(pendingFile.size / 1024).toFixed(1)} KB`
                  : 'Supported formats: .mp3, .wav, .ogg, .webm (Max 20MB)'}
              </span>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac"
                onChange={handleFileChange}
              />
            </div>

            {pendingPreviewUrl && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎧</span>
                  <div>
                    <p className="text-xs font-black text-amber-900 uppercase tracking-wider">Preview Before Upload</p>
                    <p className="text-xs text-amber-700 font-mono truncate max-w-xs">{pendingFile?.name}</p>
                  </div>
                </div>
                <audio controls src={pendingPreviewUrl} className="h-9 w-full sm:w-64" />
              </div>
            )}

            <div className="flex items-center space-x-4">
              <button
                type="button"
                disabled={uploading || !pendingFile}
                onClick={handleUpload}
                className="cursor-pointer flex-1 py-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <LoadingSpinner size={20} color="inherit" />
                    <span>Uploading Block Sound...</span>
                  </>
                ) : (
                  'Upload Block Damage Sound Effect'
                )}
              </button>
              {soundEffectUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUpload(false);
                    if (pendingPreviewUrl) {
                      URL.revokeObjectURL(pendingPreviewUrl);
                      setPendingPreviewUrl(null);
                    }
                    setPendingFile(null);
                  }}
                  className="cursor-pointer px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-all uppercase tracking-widest text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎵</span>
                <p className="text-sm font-bold text-slate-800 uppercase tracking-wide">Active Sound Effect</p>
              </div>
              <p className="text-xs font-mono text-slate-500 break-all">
                {soundEffectUrl?.split('/').pop() || 'No audio file assigned'}
              </p>
              {fullAudioUrl && (
                <div className="pt-2">
                  <audio controls src={fullAudioUrl} className="w-full max-w-md h-10" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="cursor-pointer px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={handleRemove}
                className="cursor-pointer px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow flex items-center gap-1.5"
              >
                {removing ? (
                  <>
                    <LoadingSpinner size={14} color="inherit" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>Remove</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
