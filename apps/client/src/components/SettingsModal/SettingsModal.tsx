import React, { useEffect, useCallback } from 'react';
import { useSound } from '../../contexts/SoundContext';
import './SettingsModal.css';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    closeSettings,
    bgmEnabled,
    sfxEnabled,
    bgmVolume,
    sfxVolume,
    toggleBgm,
    toggleSfx,
    setBgmVolume,
    setSfxVolume,
  } = useSound();

  // Close on Escape key press
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isSettingsOpen) {
      closeSettings();
    }
  }, [isSettingsOpen, closeSettings]);

  useEffect(() => {
    if (isSettingsOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, handleKeyDown]);

  if (!isSettingsOpen) return null;

  return (
    <div
      className="settings-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={closeSettings}
    >
      <div
        className="settings-modal-content w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base font-black text-slate-100 tracking-wider uppercase">
                Game Settings
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">Audio and preference controls</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            className="cursor-pointer text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Section: Sound Settings */}
          <div>
            <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
              <span className="text-sm">🔊</span>
              <h3 className="text-xs font-black uppercase tracking-widest text-yellow-500">
                Audio Channels
              </h3>
            </div>

            <div className="space-y-5">
              {/* Channel 1: Background Music */}
              <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-base">🎵</span>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                        Background Music
                      </span>
                      <p className="text-[10px] text-slate-400">Atmosphere, exploration & cave themes</p>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleBgm}
                    className={`cursor-pointer px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all shadow-xs ${
                      bgmEnabled
                        ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {bgmEnabled ? 'Music: ON' : 'Music: OFF'}
                  </button>
                </div>

                {/* Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400">
                    <span>Volume</span>
                    <span className="font-mono text-yellow-400">
                      {bgmEnabled ? `${Math.round(bgmVolume * 100)}%` : 'Muted'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    disabled={!bgmEnabled}
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    className={`sound-slider w-full cursor-pointer ${!bgmEnabled ? 'opacity-40' : ''}`}
                  />
                </div>
              </div>

              {/* Channel 2: Sound Effects */}
              <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-base">💥</span>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                        Effects Sounds
                      </span>
                      <p className="text-[10px] text-slate-400">Hits, pickaxe, dynamite & actions</p>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleSfx}
                    className={`cursor-pointer px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all shadow-xs ${
                      sfxEnabled
                        ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {sfxEnabled ? 'SFX: ON' : 'SFX: OFF'}
                  </button>
                </div>

                {/* Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400">
                    <span>Volume</span>
                    <span className="font-mono text-yellow-400">
                      {sfxEnabled ? `${Math.round(sfxVolume * 100)}%` : 'Muted'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    disabled={!sfxEnabled}
                    value={sfxVolume}
                    onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                    className={`sound-slider w-full cursor-pointer ${!sfxEnabled ? 'opacity-40' : ''}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center px-6 py-3.5 border-t border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={closeSettings}
            className="cursor-pointer px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
export default SettingsModal;
