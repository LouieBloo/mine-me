import { useState, useRef } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { getAssetUrl, type MiningBlockConfig } from '@mine-me/shared';
import './BlockTextureUpload.css';

interface BlockTextureUploadProps {
  block: MiningBlockConfig;
  onUploadSuccess: (updatedBlock: MiningBlockConfig) => void;
}

export default function BlockTextureUpload({ block, onUploadSuccess }: BlockTextureUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(!block.textureUrl);
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const textureInputRef = useRef<HTMLInputElement>(null);
  const [pendingTexture, setPendingTexture] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPendingTexture(null);
      return;
    }

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('Only PNG or JPG images are allowed.');
      setPendingTexture(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (img.width > 512 || img.height > 512) {
        toast.error(`Texture must be at most 512x512 pixels. This image is ${img.width}x${img.height}.`);
        setPendingTexture(null);
        if (textureInputRef.current) textureInputRef.current.value = '';
      } else {
        setPendingTexture(file);
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const handleUpload = async () => {
    if (!pendingTexture) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('texture', pendingTexture);

      const res = await fetchWithAuth(`/api/admin/blocks/${block.id}/texture`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload block texture');
      }

      const updatedBlock = await res.json();
      onUploadSuccess(updatedBlock);
      setPendingTexture(null);
      setShowUpload(false);
      toast.success('Block texture sprite updated successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const fullTextureUrl = getAssetUrl(block.textureUrl);

  return (
    <div className="block-texture-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white tracking-tight uppercase">Block Sprite Texture</h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
            PNG or JPG (Max 512x512, seamless 1:1 recommended)
          </p>
        </div>
        {!showUpload && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="cursor-pointer px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all border border-white/20"
          >
            Update Texture
          </button>
        )}
      </div>

      <div className="p-8">
        {showUpload ? (
          <div className="space-y-6">
            <div
              onClick={() => textureInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                pendingTexture
                  ? 'border-green-400 bg-green-50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50'
              }`}
            >
              <svg
                className={`w-8 h-8 mb-2 ${pendingTexture ? 'text-green-500' : 'text-slate-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm font-black uppercase text-slate-500">
                {pendingTexture ? pendingTexture.name : 'Select PNG / JPG (Max 512x512)'}
              </span>
              <input
                type="file"
                ref={textureInputRef}
                className="hidden"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
              />
            </div>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                disabled={uploading || !pendingTexture}
                onClick={handleUpload}
                className="cursor-pointer flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <LoadingSpinner size={20} color="inherit" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  'Upload Texture'
                )}
              </button>
              {block.textureUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUpload(false);
                    setPendingTexture(null);
                  }}
                  className="cursor-pointer px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-all uppercase tracking-widest text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-slate-100 rounded-xl border-2 border-slate-200 flex items-center justify-center p-2">
              {block.textureUrl ? (
                <img
                  src={fullTextureUrl}
                  alt="Block Texture"
                  className="w-full h-full object-cover rounded-lg shadow-sm"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="text-slate-400 font-bold text-xs uppercase text-center">No Texture (Procedural)</span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 uppercase tracking-wide">Current Sprite Texture</p>
              <p className="text-xs font-mono text-slate-500 mt-1">{block.textureUrl?.split('/').pop() || 'Procedural / None'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
