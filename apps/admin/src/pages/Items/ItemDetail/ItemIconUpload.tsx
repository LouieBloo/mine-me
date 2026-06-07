import { useState, useRef } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';

interface ItemIconUploadProps {
  itemId: string;
  iconUrl?: string | null;
  onUploadSuccess: (updatedItem: any) => void;
}

export default function ItemIconUpload({ itemId, iconUrl, onUploadSuccess }: ItemIconUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(!iconUrl);
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [pendingIcon, setPendingIcon] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPendingIcon(null);
      return;
    }

    if (file.type !== 'image/png') {
      toast.error('Only PNG images are allowed.');
      setPendingIcon(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (img.width > 256 || img.height > 256) {
        toast.error(`Icon must be at most 256x256 pixels. This image is ${img.width}x${img.height}.`);
        setPendingIcon(null);
        if (iconInputRef.current) iconInputRef.current.value = '';
      } else {
        setPendingIcon(file);
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const handleUpload = async () => {
    if (!pendingIcon) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('icon', pendingIcon);

      const res = await fetchWithAuth(`/api/admin/items/${itemId}/icon`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload icon');
      }
      
      const updatedItem = await res.json();
      onUploadSuccess(updatedItem);
      setPendingIcon(null);
      setShowUpload(false);
      toast.success('Item icon updated successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const fullIconUrl = iconUrl?.startsWith('http') 
    ? iconUrl 
    : (iconUrl ? `${import.meta.env.VITE_API_URL}${iconUrl}` : '');

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
           <h3 className="text-xl font-black text-white tracking-tight uppercase">Item Icon</h3>
           <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Max 256x256 PNG allowed</p>
        </div>
        {!showUpload && (
          <button 
            type="button" 
            onClick={() => setShowUpload(true)} 
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all border border-white/20"
          >
            Update Icon
          </button>
        )}
      </div>

      <div className="p-8">
        {showUpload ? (
          <div className="space-y-6">
            <div 
              onClick={() => iconInputRef.current?.click()} 
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${pendingIcon ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
            >
              <svg className={`w-8 h-8 mb-2 ${pendingIcon ? 'text-green-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-black uppercase text-slate-500">{pendingIcon ? pendingIcon.name : 'Select PNG (Max 256x256)'}</span>
              <input type="file" ref={iconInputRef} className="hidden" accept="image/png" onChange={handleFileChange} />
            </div>
            <div className="flex items-center space-x-4">
              <button 
                type="button"
                disabled={uploading || !pendingIcon} 
                onClick={handleUpload}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm"
              >
                {uploading ? 'Processing...' : 'Upload Icon'}
              </button>
              {iconUrl && (
                <button 
                  type="button"
                  onClick={() => { setShowUpload(false); setPendingIcon(null); }} 
                  className="px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-all uppercase tracking-widest text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-slate-100 rounded-xl border-2 border-slate-200 flex items-center justify-center p-2">
              {iconUrl ? (
                <img src={fullIconUrl} alt="Item Icon" className="w-full h-full object-contain pixelated" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <span className="text-slate-400 font-bold text-xs uppercase">No Icon</span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 uppercase tracking-wide">Current Icon</p>
              <p className="text-xs font-mono text-slate-500 mt-1">{iconUrl?.split('/').pop() || 'None'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
