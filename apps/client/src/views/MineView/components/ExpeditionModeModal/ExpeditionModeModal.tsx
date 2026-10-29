import React, { useEffect, useState } from 'react';
import type { MiningGameMode, MissionOfferView, MissionOffersResponse } from '@mine-me/shared';
import { Modal } from '../../../../components/Modal/Modal';
import { LoadingSpinner } from '../../../../components/LoadingSpinner/LoadingSpinner';
import { BiomePicker } from '../BiomePicker/BiomePicker';
import { MissionPicker } from '../MissionPicker/MissionPicker';
import './ExpeditionModeModal.css';

export interface ExpeditionModeModalProps {
  isOpen: boolean;
  /**
   * `biomeKeys` is only given for Single Player, and only when the player picked biomes (empty: a normal mine). `missionId` is the
   * mission picked from the offers (absent: a run without one).
   */
  onSelectMode: (mode: MiningGameMode, options?: { biomeKeys?: string[]; missionId?: string }) => void;
  onCancel: () => void;
  /**
   * Asks the server what missions a run of this mode offers. Without it the mission step is skipped (a run has no mission). When
   * there is nothing to pick (no mission fits, or the player joins a room that already has one) the run starts at once.
   */
  loadMissionOffers?: (mode: MiningGameMode) => Promise<MissionOffersResponse>;
}

export const ExpeditionModeModal: React.FC<ExpeditionModeModalProps> = ({
  isOpen,
  onSelectMode,
  onCancel,
  loadMissionOffers,
}) => {
  // Single Player has a second, optional step: which biomes to explore. Then, for a run that has missions on offer, the pick.
  const [step, setStep] = useState<'mode' | 'biomes' | 'missions'>('mode');
  const [biomeKeys, setBiomeKeys] = useState<string[]>([]);
  const [pending, setPending] = useState<{ mode: MiningGameMode; options: { biomeKeys?: string[] } } | null>(null);
  const [offers, setOffers] = useState<MissionOfferView[] | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('mode');
      setBiomeKeys([]);
      setPending(null);
      setOffers(null);
      setOffersError(null);
      setPicked(null);
    }
  }, [isOpen]);

  /** Asks for the mission offers of a run about to start; starts it at once when there is nothing to pick. */
  const askForMissions = async (mode: MiningGameMode, options: { biomeKeys?: string[] }) => {
    setPending({ mode, options });
    setStep('missions');
    setOffers(null);
    setOffersError(null);
    setPicked(null);
    try {
      const response = await loadMissionOffers!(mode);
      if (response.joining || !response.offers || response.offers.length === 0) {
        onSelectMode(mode, options);
        return;
      }
      setOffers(response.offers);
    } catch (err: any) {
      setOffersError(err?.message || 'Could not load the missions');
    }
  };

  /** Starts a run: through the mission step when this client can ask for missions, else straight away. */
  const proceed = (mode: MiningGameMode, options: { biomeKeys?: string[] } = {}) => {
    if (loadMissionOffers && mode !== 'sandbox') void askForMissions(mode, options);
    else if (mode === 'singleplayer') onSelectMode(mode, options);
    else onSelectMode(mode);
  };

  if (step === 'missions' && pending) {
    const startWith = (missionId?: string) => onSelectMode(pending.mode, { ...pending.options, ...(missionId ? { missionId } : {}) });
    return (
      <Modal isOpen={isOpen} onClose={onCancel} title="Choose a Mission" maxWidthClass="max-w-xl">
        <div className="expedition-mode-modal p-4 sm:p-6 space-y-5">
          {offers === null && !offersError && (
            <div className="py-6">
              <LoadingSpinner size="md" message="Finding work..." />
            </div>
          )}
          {offersError && (
            <div role="alert" className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-sm text-red-200 flex items-center justify-between gap-3">
              <span>{offersError}</span>
              <button type="button" onClick={() => void askForMissions(pending.mode, pending.options)} className="px-3 py-1 text-xs font-bold rounded bg-red-900/60 hover:bg-red-800 cursor-pointer">
                Retry
              </button>
            </div>
          )}
          {offers && (
            <>
              <p className="text-slate-300 text-sm leading-relaxed text-center">Pick the goal for this expedition. Finish it and leave the mine safely to be paid.</p>
              <MissionPicker offers={offers} selected={picked} onSelect={setPicked} />
            </>
          )}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(pending.mode === 'singleplayer' ? 'biomes' : 'mode')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => startWith()}
                className="px-3 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Start without a mission
              </button>
              <button
                type="button"
                disabled={!picked}
                onClick={() => startWith(picked ?? undefined)}
                className="px-5 py-2 text-sm font-bold rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Mission
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'biomes') {
    return (
      <Modal isOpen={isOpen} onClose={onCancel} title="Choose Biomes" maxWidthClass="max-w-xl">
        <div className="expedition-mode-modal p-4 sm:p-6 space-y-5">
          <p className="text-slate-300 text-sm leading-relaxed text-center">
            Explore the usual mine, or pick the biomes you want to see.
          </p>
          <BiomePicker selected={biomeKeys} onChange={setBiomeKeys} />
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep('mode')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => proceed('singleplayer', { biomeKeys })}
              className="px-5 py-2 text-sm font-bold rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              {biomeKeys.length === 0 ? 'Start Expedition' : `Start with ${biomeKeys.length} biome${biomeKeys.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

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
            onClick={() => setStep('biomes')}
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
            onClick={() => proceed('multiplayer')}
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

          {/* Sandbox Card: a test map with every block, fluid pools and spawn tools */}
          <button
            type="button"
            onClick={() => onSelectMode('sandbox')}
            className="expedition-card sm:col-span-2 flex flex-col justify-between p-5 rounded-xl bg-slate-800/80 border-2 border-slate-700 hover:border-violet-400 hover:bg-slate-850 hover:shadow-lg hover:shadow-violet-400/10 text-left transition cursor-pointer group focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl">🧪</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-violet-950/80 border border-violet-500/30 text-violet-300">
                  TESTING
                </span>
              </div>
              <h4 className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors mb-2">
                Sandbox
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                A small test mine with every block, fluid pools and full vision. Pour fluids, spawn mobs and pan the camera. Nothing you do here is saved, and other players can join.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs font-bold text-violet-400 group-hover:translate-x-1 transition-transform">
              <span>Enter Sandbox</span>
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
