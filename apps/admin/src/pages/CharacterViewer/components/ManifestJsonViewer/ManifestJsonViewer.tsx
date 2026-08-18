import React from 'react';
import { useToast } from '../../../../contexts/ToastContext';
import type { SkeletonManifest } from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import './ManifestJsonViewer.css';

export interface ManifestJsonViewerProps {
  manifest: SkeletonManifest | null;
}

export const ManifestJsonViewer: React.FC<ManifestJsonViewerProps> = ({ manifest }) => {
  const toast = useToast();

  const handleCopyJson = () => {
    if (!manifest) return;
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    toast.success('Skeleton manifest JSON copied to clipboard!');
  };

  return (
    <div className="manifest-json-viewer bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 text-base">miner_skeleton.json</h3>
          <span className="text-xs text-slate-500">Live JSON configuration with real-time tuning values</span>
        </div>
        <button
          onClick={handleCopyJson}
          className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition cursor-pointer"
        >
          📋 Copy JSON
        </button>
      </div>

      <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-[500px] border border-slate-800">
        {JSON.stringify(manifest, null, 2)}
      </pre>
    </div>
  );
};
