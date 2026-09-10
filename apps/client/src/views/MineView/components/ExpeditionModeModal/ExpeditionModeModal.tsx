import React from 'react';
import { Modal } from '../../../../components/Modal/Modal';
import './ExpeditionModeModal.css';

export interface ExpeditionModeModalProps {
  isOpen: boolean;
  onSelectMode: (mode: 'singleplayer' | 'multiplayer') => void;
  onCancel: () => void;
}

export const ExpeditionModeModal: React.FC<ExpeditionModeModalProps> = ({
  isOpen,
  onSelectMode,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Select Mining Expedition"
      maxWidthClass="max-w-xl"
    >
      <div className="expedition-mode-modal p-4 sm:p-6 space-y-6">
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed text-center">
          Choose how you would like to delve into the depths today:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Single Player Card */}
          <button
            type="button"
            onClick={() => onSelectMode('singleplayer')}
            className="expedition-card flex flex-col justify-between p-5 rounded-xl bg-slate-800/80 border-2 border-slate-700 hover:border-amber-500/80 hover:bg-slate-850 hover:shadow-lg hover:shadow-amber-500/10 text-left transition cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">⛏️</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                  SOLO
                </span>
              </div>
              <h4 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors mb-2">
                Single Player
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Explore an isolated, private mine shaft. Delve alone, harvest ores, and mine undisturbed at your own pace.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
              <span>Start Solo Expedition</span>
              <span>&rarr;</span>
            </div>
          </button>

          {/* Multiplayer Lobby Card */}
          <button
            type="button"
            onClick={() => onSelectMode('multiplayer')}
            className="expedition-card flex flex-col justify-between p-5 rounded-xl bg-slate-800/80 border-2 border-slate-700 hover:border-cyan-400 hover:bg-slate-850 hover:shadow-lg hover:shadow-cyan-400/10 text-left transition cursor-pointer group focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">👥</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                  COOPERATIVE
                </span>
              </div>
              <h4 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors mb-2">
                Multiplayer Lobby
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Join a shared mine with other players in real time. Mine the same blocks together to combine mining speeds!
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
              <span>Enter Shared Lobby</span>
              <span>&rarr;</span>
            </div>
          </button>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Return to Town
          </button>
        </div>
      </div>
    </Modal>
  );
};
