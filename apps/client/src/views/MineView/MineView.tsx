import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { PixiStageProvider } from '../../components/game/PixiStageContext/PixiStageContext';
import { MiningGrid } from './components/MiningGrid/MiningGrid';
import { MiningHUD } from './components/MiningHUD/MiningHUD';
import { notificationService } from '../../services/notificationService';
import type { MiningBackpackItem } from '@mine-me/shared';
import { Modal } from '../../components/Modal/Modal';
import { LootSpoilsModal } from '../../components/LootSpoilsModal/LootSpoilsModal';
import './MineView.css';

export const MineView: React.FC = () => {
  const { activeCharacter, playerState, miningSession, setMiningSession } = useGame();
  const { sendGameEvent } = useSocket();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [sessionKey, setSessionKey] = useState<number>(0);

  // Modal & Summary States
  const [hasMovedOffEntrance, setHasMovedOffEntrance] = useState<boolean>(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState<boolean>(false);
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [summaryLoot, setSummaryLoot] = useState<MiningBackpackItem[]>([]);

  // A ref to prevent double initialization in StrictMode
  const hasStartedRef = useRef<boolean>(false);

  // Mount/Session Initialization
  useEffect(() => {
    if (!activeCharacter) {
      navigate('/home');
      return;
    }

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const startSession = async () => {
      try {
        setLoading(true);
        const result = await sendGameEvent({ type: 'mining_start' });
        if (result.success && result.data?.sessionState) {
          setMiningSession(result.data.sessionState);
        } else {
          notificationService.error('Mining Error', result.error || 'Failed to start mining session');
          navigate('/home');
        }
      } catch (err: any) {
        console.error('[MineView] Start session error:', err);
        notificationService.error('Error', err.message || 'Could not connect to mining server');
        navigate('/home');
      } finally {
        setLoading(false);
      }
    };

    startSession();
  }, [activeCharacter, navigate, sendGameEvent, setMiningSession]);

  // Track if player has moved off the entrance and then landed back on it to trigger modal
  useEffect(() => {
    if (!miningSession) return;
    const isAtEntrance = miningSession.position.x === 15 && miningSession.position.y === 0;
    if (!isAtEntrance) {
      setHasMovedOffEntrance(true);
    } else if (hasMovedOffEntrance && isAtEntrance) {
      setShowExitConfirmation(true);
    }
  }, [miningSession?.position?.x, miningSession?.position?.y, hasMovedOffEntrance]);

  // Safe Extraction Handler
  const handleExit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendGameEvent({ type: 'mining_exit' });
      if (result.success) {
        const items = result.data?.extractedItems || [];
        setSummaryLoot(items);
        setShowSummaryModal(true);
        setMiningSession(null);
      } else {
        notificationService.error('Extraction Failed', result.error || 'Cannot extract');
      }
    } catch (err: any) {
      console.error('[MineView] Extraction error:', err);
      notificationService.error('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [sendGameEvent, setMiningSession]);

  // Abandon Session Handler (without extraction)
  const handleAbandon = useCallback(() => {
    setMiningSession(null);
    notificationService.info('Mine Abandoned', 'You abandoned the mine and lost your temporary loot.');
    navigate('/home');
  }, [setMiningSession, navigate]);

  // Restart / New Game Handler
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const handleRestart = useCallback(async () => {
    if (isRestarting) return;
    try {
      setIsRestarting(true);
      const result = await sendGameEvent({ type: 'mining_start', forceNew: true });
      if (result.success && result.data?.sessionState) {
        setMiningSession(result.data.sessionState);
        setSessionKey((prev) => prev + 1);
        setHasMovedOffEntrance(false);
        setShowExitConfirmation(false);
        notificationService.success('New Mine Generated', 'Started a fresh mining expedition.');
      } else {
        notificationService.error('Mining Error', result.error || 'Failed to start a new mining session');
      }
    } catch (err: any) {
      console.error('[MineView] Restart session error:', err);
      notificationService.error('Error', err.message || 'Could not restart mining session');
    } finally {
      setIsRestarting(false);
    }
  }, [isRestarting, sendGameEvent, setMiningSession]);
  const xpGained = summaryLoot.reduce((sum, item) => sum + item.quantity * 5, 0);
  const mappedLootItems = (() => {
    const groupedMap: Record<string, typeof summaryLoot[number]> = {};
    for (const item of summaryLoot) {
      if (groupedMap[item.itemId]) {
        groupedMap[item.itemId] = {
          ...groupedMap[item.itemId],
          quantity: groupedMap[item.itemId].quantity + item.quantity
        };
      } else {
        groupedMap[item.itemId] = { ...item };
      }
    }
    return Object.values(groupedMap).map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      itemDetails: {
        id: item.itemId,
        name: item.itemName,
        description: 'A resource extracted from the dungeon mine.',
        iconUrl: item.iconUrl,
        type: 'MATERIAL',
        rarity: 'LOW',
      },
    }));
  })();

  if ((loading && !showSummaryModal) || !activeCharacter || !playerState || (!miningSession && !showSummaryModal)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(245,158,11,0.2)]" />
        <p className="mt-4 text-slate-400 text-sm font-black tracking-widest uppercase animate-pulse">
          Entering Dungeon Mine...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden h-full">
      {/* Background layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />

      {/* PixiJS Visual Stage */}
      {miningSession && (
        <PixiStageProvider key={sessionKey} className="flex-1 relative flex overflow-hidden">
          <MiningGrid
            sessionState={miningSession}
            playerState={playerState}
            onExit={handleExit}
          />
        </PixiStageProvider>
      )}

      {/* HTML HUD Overlay */}
      {miningSession && (
        <MiningHUD
          sessionState={miningSession}
          playerState={playerState}
          onExit={handleExit}
          onAbandon={handleAbandon}
          onRestart={handleRestart}
          isRestarting={isRestarting}
        />
      )}

      {/* Exit Confirmation Modal */}
      <Modal
        isOpen={showExitConfirmation}
        onClose={() => setShowExitConfirmation(false)}
        title={
          <span className="flex items-center gap-2 text-emerald-400">
            🚪 Leave Mine?
          </span>
        }
        maxWidthClass="max-w-md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-300">
            You have returned to the exit ladder. Would you like to safely extract all items in your temporary loot sack and leave the mine?
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={() => setShowExitConfirmation(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest rounded-lg border border-slate-700 cursor-pointer transition-all active:scale-95"
            >
              Keep Exploring
            </button>
            <button
              onClick={async () => {
                setShowExitConfirmation(false);
                await handleExit();
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-lg border border-emerald-400 cursor-pointer transition-all active:scale-95 shadow-md shadow-emerald-950/20"
            >
              Extract & Leave
            </button>
          </div>
        </div>
      </Modal>

      {/* Summary Loot spoils modal */}
      <LootSpoilsModal
        isOpen={showSummaryModal}
        onClose={() => {
          setShowSummaryModal(false);
          setSummaryLoot([]);
          navigate('/home');
        }}
        title={
          <span className="flex items-center gap-2 text-amber-400">
            ⛏️ Expedition Summary
          </span>
        }
        description="You successfully extracted from the mine! Here are the spoils gathered:"
        sol={0}
        experience={xpGained}
        items={mappedLootItems}
        acceptButtonText="Accept Spoils"
      />
    </div>
  );
};
