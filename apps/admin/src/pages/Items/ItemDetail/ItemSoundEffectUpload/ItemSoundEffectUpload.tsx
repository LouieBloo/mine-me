import React, { useState, useRef, useEffect } from 'react';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import {
  getAssetUrl,
  type ItemSoundProfile,
  type ItemSoundEffectsConfig,
  type ItemSoundSlotDefinition,
  ItemSoundProfileRegistry,
  WeaponSoundProfile,
} from '@mine-me/shared';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './ItemSoundEffectUpload.css';

interface ItemSoundEffectUploadProps {
  itemId: string;
  profile?: ItemSoundProfile;
  soundEffects?: ItemSoundEffectsConfig | null;
  soundEffectUrl?: string | null;
  onUploadSuccess: (updatedItem: any) => void;
}

export default function ItemSoundEffectUpload({
  itemId,
  profile = ItemSoundProfileRegistry.getProfile('WEAPON') || new WeaponSoundProfile(),
  soundEffects,
  soundEffectUrl,
  onUploadSuccess,
}: ItemSoundEffectUploadProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const slots = profile.getSlots();
  const normalizedConfig = profile.normalizeConfig(soundEffects, soundEffectUrl);

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [removingSlot, setRemovingSlot] = useState<string | null>(null);
  const [patchingSlot, setPatchingSlot] = useState<string | null>(null);
  const [replacingSlots, setReplacingSlots] = useState<Record<string, boolean>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>({});
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<Record<string, string | null>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingPreviewUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const handleFileChange = (slotKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (pendingPreviewUrls[slotKey]) {
        URL.revokeObjectURL(pendingPreviewUrls[slotKey]!);
      }
      setPendingFiles((prev) => ({ ...prev, [slotKey]: null }));
      setPendingPreviewUrls((prev) => ({ ...prev, [slotKey]: null }));
      return;
    }

    const allowedExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];
    const hasAudioType =
      file.type.startsWith('audio/') ||
      allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasAudioType) {
      toast.error('Only audio files (.mp3, .wav, .ogg, .webm, .m4a, .aac, .flac) are allowed.');
      if (fileInputRefs.current[slotKey]) fileInputRefs.current[slotKey]!.value = '';
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Audio file must be less than 20MB.');
      if (fileInputRefs.current[slotKey]) fileInputRefs.current[slotKey]!.value = '';
      return;
    }

    if (pendingPreviewUrls[slotKey]) {
      URL.revokeObjectURL(pendingPreviewUrls[slotKey]!);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingFiles((prev) => ({ ...prev, [slotKey]: file }));
    setPendingPreviewUrls((prev) => ({ ...prev, [slotKey]: previewUrl }));
  };

  const handleUpload = async (slotDef: ItemSoundSlotDefinition) => {
    const slotKey = slotDef.slotKey;
    const file = pendingFiles[slotKey];
    if (!file) return;

    setUploadingSlot(slotKey);
    try {
      const formData = new FormData();
      formData.append('soundEffect', file);
      const currentLoop = normalizedConfig[slotKey]?.loop ?? slotDef.defaultLoop;
      formData.append('loop', String(currentLoop));

      const res = await fetchWithAuth(`/api/admin/items/${itemId}/sound-effects/${slotKey}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to upload ${slotDef.label}`);
      }

      const updatedItem = await res.json();
      onUploadSuccess(updatedItem);

      if (pendingPreviewUrls[slotKey]) {
        URL.revokeObjectURL(pendingPreviewUrls[slotKey]!);
      }
      setPendingFiles((prev) => ({ ...prev, [slotKey]: null }));
      setPendingPreviewUrls((prev) => ({ ...prev, [slotKey]: null }));
      setReplacingSlots((prev) => ({ ...prev, [slotKey]: false }));
      toast.success(`${slotDef.label} updated successfully!`);
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${slotDef.label}`);
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleRemove = async (slotDef: ItemSoundSlotDefinition) => {
    const slotKey = slotDef.slotKey;
    if (!window.confirm(`Are you sure you want to remove the ${slotDef.label}?`)) {
      return;
    }

    setRemovingSlot(slotKey);
    try {
      const res = await fetchWithAuth(`/api/admin/items/${itemId}/sound-effects/${slotKey}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to remove ${slotDef.label}`);
      }

      const updatedItem = await res.json();
      onUploadSuccess(updatedItem);

      if (pendingPreviewUrls[slotKey]) {
        URL.revokeObjectURL(pendingPreviewUrls[slotKey]!);
      }
      setPendingFiles((prev) => ({ ...prev, [slotKey]: null }));
      setPendingPreviewUrls((prev) => ({ ...prev, [slotKey]: null }));
      setReplacingSlots((prev) => ({ ...prev, [slotKey]: false }));
      toast.success(`${slotDef.label} removed successfully!`);
    } catch (err: any) {
      toast.error(err.message || `Failed to remove ${slotDef.label}`);
    } finally {
      setRemovingSlot(null);
    }
  };

  const handleToggleLoop = async (slotDef: ItemSoundSlotDefinition) => {
    const slotKey = slotDef.slotKey;
    const currentLoop = normalizedConfig[slotKey]?.loop ?? slotDef.defaultLoop;
    const nextLoop = !currentLoop;

    setPatchingSlot(slotKey);
    try {
      const res = await fetchWithAuth(`/api/admin/items/${itemId}/sound-effects/${slotKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loop: nextLoop }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update looping setting');
      }

      const updatedItem = await res.json();
      onUploadSuccess(updatedItem);
      toast.success(`${slotDef.label} looping set to ${nextLoop ? 'ON' : 'OFF'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update looping setting');
    } finally {
      setPatchingSlot(null);
    }
  };

  return (
    <div className="item-sound-effect-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
            <span>{profile.title}</span>
            <span className="text-amber-400 text-base">🔊</span>
          </h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
            {profile.description}
          </p>
        </div>
        <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20 text-xs font-mono text-slate-300 font-bold">
          {slots.length} {slots.length === 1 ? 'Slot' : 'Slots'}
        </div>
      </div>

      {/* Slots List */}
      <div className="p-8 space-y-8">
        {slots.map((slotDef, idx) => {
          const slotKey = slotDef.slotKey;
          const slotConfig = normalizedConfig[slotKey];
          const hasUploadedSound = Boolean(slotConfig?.url);
          const isReplacing = replacingSlots[slotKey] || false;
          const showUploadArea = !hasUploadedSound || isReplacing;

          const pendingFile = pendingFiles[slotKey];
          const pendingPreviewUrl = pendingPreviewUrls[slotKey];
          const fullAudioUrl = slotConfig?.url ? getAssetUrl(slotConfig.url) : null;
          const isLooping = slotConfig?.loop ?? slotDef.defaultLoop;

          const isUploading = uploadingSlot === slotKey;
          const isRemoving = removingSlot === slotKey;
          const isPatching = patchingSlot === slotKey;

          return (
            <div
              key={slotKey}
              data-testid={`sound-slot-${slotKey}`}
              className="bg-slate-50/80 rounded-2xl p-6 border border-slate-200/80 transition-all hover:border-slate-300"
            >
              {/* Slot Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{slotDef.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-slate-800 tracking-tight">
                        {idx + 1}. {slotDef.label}
                      </h4>
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-mono font-bold uppercase rounded">
                        {slotKey}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{slotDef.description}</p>
                  </div>
                </div>

                {/* Looping toggle if slot allows it */}
                {slotDef.loopToggleable && (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm self-end sm:self-auto">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={isLooping}
                        disabled={isPatching}
                        onChange={() => handleToggleLoop(slotDef)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span>Looping Sound</span>
                    </label>
                    {isPatching && <LoadingSpinner size={14} color="inherit" />}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        isLooping
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {isLooping ? 'Loop: ON' : 'Loop: OFF'}
                    </span>
                  </div>
                )}
              </div>

              {/* Slot Body */}
              {showUploadArea ? (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRefs.current[slotKey]?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      pendingFile
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-slate-300 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <svg
                      className={`w-8 h-8 mb-2 ${pendingFile ? 'text-amber-500' : 'text-slate-400'}`}
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
                    <span className="text-sm font-black uppercase text-slate-700">
                      {pendingFile ? pendingFile.name : `Select ${slotDef.label} Audio`}
                    </span>
                    <span className="text-xs text-slate-400 mt-0.5">
                      {pendingFile
                        ? `${(pendingFile.size / 1024).toFixed(1)} KB`
                        : 'Supported formats: .mp3, .wav, .ogg, .webm (Max 20MB)'}
                    </span>
                    <input
                      type="file"
                      ref={(el) => {
                        fileInputRefs.current[slotKey] = el;
                      }}
                      className="hidden"
                      accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac"
                      onChange={(e) => handleFileChange(slotKey, e)}
                    />
                  </div>

                  {/* Pre-upload preview */}
                  {pendingPreviewUrl && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🎧</span>
                        <div>
                          <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
                            Preview Audio
                          </p>
                          <p className="text-xs text-amber-700 font-mono truncate max-w-xs">
                            {pendingFile?.name}
                          </p>
                        </div>
                      </div>
                      <audio controls src={pendingPreviewUrl} className="h-8 w-full sm:w-60" />
                    </div>
                  )}

                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      disabled={isUploading || !pendingFile}
                      onClick={() => handleUpload(slotDef)}
                      className="cursor-pointer flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black rounded-xl shadow transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                    >
                      {isUploading ? (
                        <>
                          <LoadingSpinner size={16} color="inherit" />
                          <span>Uploading {slotDef.label}...</span>
                        </>
                      ) : (
                        `Upload ${slotDef.label}`
                      )}
                    </button>
                    {hasUploadedSound && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingSlots((prev) => ({ ...prev, [slotKey]: false }));
                          if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
                          setPendingFiles((prev) => ({ ...prev, [slotKey]: null }));
                          setPendingPreviewUrls((prev) => ({ ...prev, [slotKey]: null }));
                        }}
                        className="cursor-pointer px-5 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all uppercase tracking-wider text-xs"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎵</span>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Active Audio Cue
                      </p>
                    </div>
                    <p className="text-xs font-mono text-slate-500 truncate max-w-md">
                      {slotConfig?.url?.split('/').pop() || 'sound_effect.mp3'}
                    </p>
                    {fullAudioUrl && (
                      <div className="pt-1">
                        <audio controls src={fullAudioUrl} className="w-full max-w-sm h-8" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setReplacingSlots((prev) => ({ ...prev, [slotKey]: true }))}
                      className="cursor-pointer px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={isRemoving}
                      onClick={() => handleRemove(slotDef)}
                      className="cursor-pointer px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow flex items-center gap-1.5"
                    >
                      {isRemoving ? (
                        <>
                          <LoadingSpinner size={12} color="inherit" />
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
          );
        })}
      </div>
    </div>
  );
}
