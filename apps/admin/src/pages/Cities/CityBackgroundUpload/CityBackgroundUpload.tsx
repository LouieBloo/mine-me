import { useState, useRef } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import { getAssetUrl } from '@mine-me/shared';
import './CityBackgroundUpload.css';

interface CityBackgroundUploadProps {
  cityId: string;
  backgroundImageUrl?: string | null;
  onUploadSuccess: (updatedCity: any) => void;
}

export default function CityBackgroundUpload({ cityId, backgroundImageUrl, onUploadSuccess }: CityBackgroundUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(!backgroundImageUrl);
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPendingFile(null);
      return;
    }

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('Only PNG or JPG images are allowed.');
      setPendingFile(null);
      return;
    }

    setPendingFile(file);
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('background', pendingFile);

      const res = await fetchWithAuth(`/api/admin/cities/${cityId}/background`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload background');
      }
      
      const updatedCity = await res.json();
      onUploadSuccess(updatedCity);
      setPendingFile(null);
      setShowUpload(false);
      toast.success('City background updated successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const fullUrl = getAssetUrl(backgroundImageUrl);

  return (
    <div className="city-background-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
           <h3 className="text-xl font-black text-white tracking-tight uppercase">City Background</h3>
           <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">PNG or JPG required</p>
        </div>
        {!showUpload && (
          <button 
            type="button" 
            onClick={() => setShowUpload(true)} 
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all border border-white/20"
          >
            Update Background
          </button>
        )}
      </div>

      <div className="p-8">
        {showUpload ? (
          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()} 
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${pendingFile ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
            >
              <svg className={`w-8 h-8 mb-2 ${pendingFile ? 'text-green-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-black uppercase text-slate-500 text-center">{pendingFile ? pendingFile.name : 'Select PNG or JPG Background'}</span>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg" onChange={handleFileChange} />
            </div>
            <div className="flex items-center space-x-4">
              <button 
                type="button"
                disabled={uploading || !pendingFile} 
                onClick={handleUpload}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm"
              >
                {uploading ? 'Processing...' : 'Upload Background'}
              </button>
              {backgroundImageUrl && (
                <button 
                  type="button"
                  onClick={() => { setShowUpload(false); setPendingFile(null); }} 
                  className="px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-all uppercase tracking-widest text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-full h-48 bg-slate-100 rounded-xl border-2 border-slate-200 flex items-center justify-center overflow-hidden">
              {backgroundImageUrl ? (
                <img src={fullUrl} alt="City Background" className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-400 font-bold text-xs uppercase text-center">No Background Uploaded</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Current Status</p>
              <p className="text-xs font-mono text-slate-400">{backgroundImageUrl?.split('/').pop() || 'None'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
