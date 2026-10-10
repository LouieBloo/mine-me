import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useApi } from '../../../hooks/useApi';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import type { SoundCategory, SoundType, SoundTrack } from '@mine-me/shared';
import './UploadSoundModal.css';

interface UploadSoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newTrack: SoundTrack) => void;
}

export const UploadSoundModal: React.FC<UploadSoundModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<SoundType>('BGM');
  const [category, setCategory] = useState<SoundCategory>('GENERAL');
  const [volume, setVolume] = useState<number>(0.8);
  const [loop, setLoop] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFile(null);
    setName('');
    setDescription('');
    setType('BGM');
    setCategory('GENERAL');
    setVolume(0.8);
    setLoop(true);
    setIsActive(true);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset form whenever modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      // The sound keeps the file's own name (minus the extension); it can still be edited here
      const autoName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setName(autoName);
      setError(null);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an audio file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());
      formData.append('description', description.trim());
      formData.append('type', type);
      formData.append('category', type === 'SFX' ? category : 'GENERAL');
      formData.append('volume', volume.toString());
      formData.append('loop', loop.toString());
      formData.append('isActive', isActive.toString());

      const res = await fetchWithAuth('/api/admin/sounds', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload sound file');
      }

      const created: SoundTrack = await res.json();
      toast.success(`Track "${created.name}" uploaded successfully!`);
      resetForm();
      onSuccess(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-sound-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">Upload Sound Track</h3>
            <p className="text-xs text-slate-500 font-medium">Add background music or sound effects to the game</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* File Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Audio File <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-emerald-400 bg-emerald-50/30'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.webm,.m4a,.aac,.flac,audio/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />
              {file ? (
                <div className="flex items-center justify-center space-x-2 text-emerald-800">
                  <span className="text-xl">🎵</span>
                  <div className="text-left">
                    <p className="text-xs font-bold truncate max-w-xs">{file.name}</p>
                    <p className="text-[10px] text-emerald-600 font-medium">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600">
                    Click to select audio file (.mp3, .wav, .ogg, .webm)
                  </p>
                  <p className="text-[10px] text-slate-400">Max size 35 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Track Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cave Depths Ambience"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              disabled={uploading}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Plays during deep cavern exploration"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              disabled={uploading}
            />
          </div>

          {/* Type & Volume Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Channel / Type
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const val = e.target.value as SoundType;
                  setType(val);
                  if (val === 'SFX') {
                    setLoop(false);
                    setVolume(0.9);
                  } else {
                    setLoop(true);
                    setVolume(0.7);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
                disabled={uploading}
              >
                <option value="BGM">Background Music (BGM)</option>
                <option value="SFX">Sound Effect (SFX)</option>
              </select>
            </div>

            {type === 'SFX' && (
              <div>
                <label htmlFor="sound-category" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Used For
                </label>
                <select
                  id="sound-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SoundCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
                  disabled={uploading}
                >
                  <option value="GENERAL">General / other</option>
                  <option value="MOB">Mob</option>
                  <option value="ITEM">Item</option>
                  <option value="BLOCK">Block</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Preset Volume: {Math.round(volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full cursor-pointer mt-2"
                disabled={uploading}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center space-x-6 pt-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                disabled={uploading}
              />
              <span className="text-xs font-semibold text-slate-700">Loop playback</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                disabled={uploading}
              />
              <span className="text-xs font-semibold text-slate-700">Active (playable in game)</span>
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end items-center space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="cursor-pointer px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="cursor-pointer px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all shadow-sm flex items-center space-x-2 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <LoadingSpinner size={16} color="inherit" />
                  <span>Uploading...</span>
                </>
              ) : (
                <span>Upload Track</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default UploadSoundModal;
