import { useEffect, useState, useRef } from 'react';
import type { MobAtlas } from '@mine-me/shared/types';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import './SpriteAtlasOverview.css';

interface SpriteAtlasOverviewProps {
  mobId: string;
  config?: MobAtlas;
  onUploadSuccess: (updatedMob: any) => void;
}

export default function SpriteAtlasOverview({ mobId, config, onUploadSuccess }: SpriteAtlasOverviewProps) {
  const [jsonContent, setJsonContent] = useState<string | null>(null);
  const [loadingJson, setLoadingJson] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(!config?.url);
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  
  const spriteInputRef = useRef<HTMLInputElement>(null);
  const atlasInputRef = useRef<HTMLInputElement>(null);
  const [pendingSprite, setPendingSprite] = useState<File | null>(null);
  const [pendingAtlas, setPendingAtlas] = useState<File | null>(null);

  useEffect(() => {
    if (config?.atlasUrl) {
      setLoadingJson(true);
      const atlasUrlPath = config.atlasUrl;
      const url = atlasUrlPath.startsWith('http') ? atlasUrlPath : `${import.meta.env.VITE_API_URL}${atlasUrlPath}`;
      fetch(url)
        .then(res => res.text())
        .then(text => {
          try {
             // Try to format it if it's JSON
             setJsonContent(JSON.stringify(JSON.parse(text), null, 2));
          } catch {
             setJsonContent(text);
          }
          setLoadingJson(false);
        })
        .catch(() => {
          setJsonContent("Failed to load atlas content.");
          setLoadingJson(false);
        });
    } else {
      setJsonContent(null);
    }
  }, [config?.atlasUrl]);

  const handleUpload = async () => {
    if (!pendingSprite && !pendingAtlas) return;
    setUploading(true);
    try {
      const formData = new FormData();
      if (pendingSprite) formData.append('sprite', pendingSprite);
      if (pendingAtlas) formData.append('atlas', pendingAtlas);

      const res = await fetchWithAuth(`/api/admin/mobs/${mobId}/sprite-atlas`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Failed to upload atlas files');
      const updatedMob = await res.json();
      onUploadSuccess(updatedMob);
      setPendingSprite(null);
      setPendingAtlas(null);
      setShowUpload(false);
      toast.success('Mob atlas updated successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const hasConfig = !!config?.url && !!config?.atlasUrl;
  const fullSpriteUrl = config?.url?.startsWith('http') 
    ? config.url 
    : (config?.url ? `${import.meta.env.VITE_API_URL}${config.url}` : '');

  return (
    <div className="atlas-overview-card">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
           <h3 className="text-xl font-black text-white tracking-tight uppercase">Sprite Atlas Overview</h3>
           <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Global Assets for PixiJS</p>
        </div>
        {!showUpload && (
          <button onClick={() => setShowUpload(true)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all border border-white/20">
            Update Atlas Files
          </button>
        )}
      </div>

      <div className="relative">
        <div className={`upload-overlay ${showUpload ? 'active' : ''}`}>
           <div className="max-w-xl w-full p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div 
                   onClick={() => spriteInputRef.current?.click()} 
                   className={`drop-zone ${pendingSprite ? 'border-green-400 bg-green-50' : ''}`}
                 >
                    <svg className={`w-8 h-8 mb-2 ${pendingSprite ? 'text-green-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-[10px] font-black uppercase text-slate-500">{pendingSprite ? pendingSprite.name : 'Select Sprite PNG'}</span>
                    <input type="file" ref={spriteInputRef} className="hidden" accept="image/png" onChange={(e) => setPendingSprite(e.target.files?.[0] || null)} />
                 </div>
                 <div 
                   onClick={() => atlasInputRef.current?.click()} 
                   className={`drop-zone ${pendingAtlas ? 'border-green-400 bg-green-50' : ''}`}
                 >
                    <svg className={`w-8 h-8 mb-2 ${pendingAtlas ? 'text-green-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span className="text-[10px] font-black uppercase text-slate-500">{pendingAtlas ? pendingAtlas.name : 'Select Atlas JSON'}</span>
                    <input type="file" ref={atlasInputRef} className="hidden" accept="application/json" onChange={(e) => setPendingAtlas(e.target.files?.[0] || null)} />
                 </div>
              </div>
              <div className="flex items-center space-x-4">
                 <button 
                   disabled={uploading || (!pendingSprite && !pendingAtlas)} 
                   onClick={handleUpload}
                   className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm"
                 >
                    {uploading ? 'Processing...' : 'Upload Atlas Pair'}
                 </button>
                 {hasConfig && (
                    <button onClick={() => setShowUpload(false)} className="px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-all uppercase tracking-widest text-sm">Cancel</button>
                 )}
              </div>
           </div>
        </div>

        <div className="atlas-preview-grid">
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Spritesheet Visualization</h4>
                 {(config && config.url) && <span className="text-[10px] font-bold text-slate-300 font-mono">{config.url.split('/').pop()}</span>}
              </div>
              <div className="atlas-image-container group">
                 {config?.url ? (
                    <img src={fullSpriteUrl} alt="Spritesheet" />
                 ) : (
                    <div className="text-slate-300 font-bold uppercase text-xs">No PNG Uploaded</div>
                 )}
              </div>
           </div>

           <div className="atlas-json-container">
              <div className="atlas-json-header">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Atlas Metadata (JSON)</h4>
                 {(config && config.atlasUrl) && <span className="text-[10px] font-bold text-slate-300 font-mono">{config.atlasUrl.split('/').pop()}</span>}
              </div>
              <div className="atlas-json-content custom-scrollbar">
                 {loadingJson ? (
                    <div className="h-full flex items-center justify-center"><LoadingSpinner size={30} /></div>
                 ) : jsonContent ? (
                    <pre className="whitespace-pre-wrap">{jsonContent}</pre>
                 ) : (
                    <div className="h-full flex items-center justify-center italic text-slate-600">No JSON Uploaded</div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
