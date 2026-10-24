import React, { useEffect, useState } from 'react';
import { biomeDebug } from '../MiningGrid/utils/biomeDebug';
import type { BiomeDebugInfo } from '../MiningGrid/systems/BiomeAmbient';
import './BiomeDebugOverlay.css';

/** How often the numbers refresh while the overlay is open. */
const REFRESH_MS = 250;

/**
 * Shows which biome the player is in and how the biomes blend around them, plus the biome under the cursor. Opened with
 * F4 (or `?miningBiomes=1`); only mines with more than one biome have anything to show.
 */
export const BiomeDebugOverlay: React.FC = () => {
  const [open, setOpen] = useState(biomeDebug.enabled);
  const [info, setInfo] = useState<BiomeDebugInfo | null>(null);

  useEffect(() => {
    const unsubscribe = biomeDebug.subscribe(() => setOpen(biomeDebug.enabled));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F4') return;
      e.preventDefault();
      biomeDebug.setEnabled(!biomeDebug.enabled);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setInfo(biomeDebug.info);
    const timer = window.setInterval(() => setInfo(biomeDebug.info), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="biome-debug-overlay bg-slate-900/85 text-white rounded-lg shadow-lg p-3 text-xs font-mono" role="status" aria-label="Biome debug">
      <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Biomes (F4)</div>
      {!info ? (
        <div className="text-slate-400">This mine has one biome.</div>
      ) : (
        <>
          {info.names.map((name, i) => (
            <div key={name + i} className="flex justify-between gap-4" data-testid="biome-share">
              <span className="text-slate-300">{name}</span>
              <span>{Math.round(info.shares[i] * 100)}%</span>
            </div>
          ))}
          <div className="mt-1.5 flex justify-between gap-4">
            <span className="text-slate-400">Under cursor</span>
            <span data-testid="biome-cursor">
              {info.cursor ? (info.cursor.biome ?? 'unknown (hidden)') : '-'}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
