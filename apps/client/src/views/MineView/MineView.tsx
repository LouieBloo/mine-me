import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useQuickAccess } from '../../contexts/QuickAccessContext';
import { useSound } from '../../contexts/SoundContext';
import { PixiStageProvider } from '../../components/game/PixiStageContext/PixiStageContext';
import { MiningGrid } from './components/MiningGrid/MiningGrid';
import { MiningHUD } from './components/MiningHUD/MiningHUD';
import { LOADING_SCREEN_EXIT_MS, MiningLoadingScreen } from './components/MiningLoadingScreen/MiningLoadingScreen';
import { notificationService } from '../../services/notificationService';
import { type BeltBlockedReason, type MiningBackpackItem, type MiningGameMode, type MissionOffersResponse, type MissionResultView } from '@mine-me/shared';
import { Modal } from '../../components/Modal/Modal';
import { LootSpoilsModal } from '../../components/LootSpoilsModal/LootSpoilsModal';
import { miningStartEvent } from './miningStartEvent';
import { ExpeditionModeModal } from './components/ExpeditionModeModal/ExpeditionModeModal';
import { ExitPrompt } from './components/ExitPrompt/ExitPrompt';
import { useExitKey } from './components/ExitPrompt/useExitKey';
import { SandboxPanel } from './components/SandboxPanel/SandboxPanel';
import { useSandboxController } from './hooks/useSandboxController';
import { useMissionSync, playMissionSound } from './hooks/useMissionSync';
import { MissionSummary } from './components/MissionSummary/MissionSummary';
import { buildRunSummary } from './runSummary';
import './MineView.css';

export const MineView: React.FC = () => {
  const { activeCharacter, playerState, miningSession, setMiningSession } = useGame();
  const { sendGameEvent, onEvent } = useSocket();
  const { soundManager } = useSound();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [isAssetsLoaded, setIsAssetsLoaded] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [sessionKey, setSessionKey] = useState<number>(0);

  // Sandbox tools (inert unless the session is a sandbox)
  const sandbox = useSandboxController(sendGameEvent, miningSession);

  // Camera Zoom State (persisted in localStorage, default 150%, range 100% - 200%)
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mining_camera_zoom');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 2.0) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return 1.5;
  });

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.min(2.0, Math.max(1.0, Math.round(newZoom * 100) / 100));
    setZoom(clamped);
    try {
      localStorage.setItem('mining_camera_zoom', clamped.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Modal & Summary States
  const [showModeModal, setShowModeModal] = useState<boolean>(!miningSession);
  // Whether the player stands at the extraction point (reported by the mine's frame loop)
  const [atExit, setAtExit] = useState<boolean>(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState<boolean>(false);
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [summaryLoot, setSummaryLoot] = useState<MiningBackpackItem[]>([]);
  // How the run's mission went: a section of the one Expedition Summary (safe exit, or a run the server ended)
  const [summaryMission, setSummaryMission] = useState<MissionResultView | null>(null);
  // Set when the server ended the run (death, time limit): the summary says why, in place of the usual safe-exit text
  const [summaryEnded, setSummaryEnded] = useState<{ title: string; message: string } | null>(null);

  // Debug hitboxes & reach mode state
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const handleToggleDebug = useCallback(() => {
    setShowDebug((prev) => !prev);
  }, []);

  // Torch, Ladder and Dynamite/Throwable Placement Mode State from QuickAccessContext
  const { isPlacingTorch, isPlacingLadder, isPlacingBridge, isThrowingDynamite, isThrowingItem, activeThrowableItem, selectSlot } = useQuickAccess();

  // Auto-select slot 1 only once when first entering the mine
  const initialSelectRef = useRef<boolean>(false);
  useEffect(() => {
    if (!initialSelectRef.current) {
      initialSelectRef.current = true;
      selectSlot(0).catch(() => {});
    }
  }, [selectSlot]);

  // Start background music when entering the mine, stop when leaving
  useEffect(() => {
    soundManager.startSessionBgm();
    return () => {
      soundManager.stopBgm();
    };
  }, [soundManager]);

  const handleTorchPlaced = useCallback(() => {
    // Placement mode stays active until the player runs out of torches; no toast needed
  }, []);

  const handleLadderPlaced = useCallback(() => {
    // Placement mode stays active until the player runs out of ladders; no toast needed
  }, []);

  const handleDynamiteThrown = useCallback(() => {
    // Throw mode stays active until the player runs out of dynamite
  }, []);

  const handleVisionChange = useCallback((newVision: number) => {
    setMiningSession((prev) => {
      if (!prev || prev.visionRange === newVision) return prev;
      return { ...prev, visionRange: newVision };
    });
  }, [setMiningSession]);

  const handleBackpackChange = useCallback((newBackpack: MiningBackpackItem[], load: { weight?: number; capacity?: number }) => {
    setMiningSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        temporaryBackpack: newBackpack,
        backpackWeight: load.weight ?? prev.backpackWeight,
        backpackCapacity: load.capacity ?? prev.backpackCapacity,
      };
    });
  }, [setMiningSession]);

  const handleStashChange = useCallback((stash: MiningBackpackItem[]) => {
    setMiningSession((prev) => (prev ? { ...prev, stash } : prev));
  }, [setMiningSession]);

  const handleBeltChange = useCallback((update: { rows: number; blockedBy: BeltBlockedReason | null }) => {
    setMiningSession((prev) => (prev?.belt ? { ...prev, belt: { ...prev.belt, rows: update.rows, blockedBy: update.blockedBy } } : prev));
  }, [setMiningSession]);

  const handleBackpackFull = useCallback(() => {
    notificationService.info('Backpack Full', 'That does not fit. Empty your backpack at the entrance, then come back for it.');
  }, []);

  // Track whether session has already been extracted/cleaned up so unmount doesn't double-cancel
  const isCleanedUpRef = useRef<boolean>(false);

  // (kept in a ref so a run that ends can still play the mission's own "failed" sound after the session is cleared)
  const lostMissionRef = useRef(miningSession?.mission);
  lostMissionRef.current = miningSession?.mission ?? lostMissionRef.current;

  // The server can end a run on its own: the 15 minute limit, or the player dying
  useEffect(() => {
    const endRun = (title: string, message: string, severity: 'info' | 'error', mission?: MissionResultView) => {
      isCleanedUpRef.current = true;
      setMiningSession(null);
      if (mission) {
        // A run with a mission ends on the Expedition Summary (the one end screen), which says why and shows the failed mission
        if (lostMissionRef.current) playMissionSound(lostMissionRef.current, 'failed', (url, options) => soundManager.playSfx?.(url, options as never));
        setSummaryLoot([]);
        setSummaryMission(mission);
        setSummaryEnded({ title, message });
        setShowSummaryModal(true);
        return;
      }
      notificationService[severity](title, message);
      navigate('/home');
    };

    const cleanupTimeout = onEvent('mining_session_timeout', (payload: { message?: string; mission?: MissionResultView }) => {
      endRun(
        'Time Limit Reached',
        payload?.message || 'Your mining expedition has reached its 15-minute time limit and ended.',
        'info',
        payload?.mission
      );
    });
    const cleanupEnded = onEvent('mining_session_ended', (payload) => {
      endRun(payload?.title || 'Expedition Over', payload?.message || 'Your expedition has ended.', 'error', payload?.mission);
    });

    return () => {
      cleanupTimeout();
      cleanupEnded();
    };
  }, [onEvent, setMiningSession, navigate, soundManager]);

  // Tool feedback from the server, e.g. "Your tool isn't strong enough to break Silverium."
  useEffect(() => {
    return onEvent('mining_notice', (payload) => {
      if (payload?.message) notificationService.info('Tool Too Weak', payload.message);
    });
  }, [onEvent]);

  // Clean up server session and local context if player navigates away without extraction
  useEffect(() => {
    return () => {
      if (!isCleanedUpRef.current) {
        sendGameEvent({ type: 'mining_cancel' }).catch(() => {});
      }
      setMiningSession(null);
    };
  }, [sendGameEvent, setMiningSession]);

  // The sandbox was reset (by anyone in it): rebuild the view from the fresh state the server sent
  useEffect(() => {
    return onEvent('mining_sandbox_reset', (payload) => {
      if (!payload?.sessionState) return;
      setIsAssetsLoaded(false);
      setMiningSession(payload.sessionState);
      setSessionKey((prev) => prev + 1);
      notificationService.info(payload.title ?? 'Sandbox reset', payload.message ?? 'The sandbox is back to its starting state.');
    });
  }, [onEvent, setMiningSession]);

  // The HUD's mission follows the server (progress in the tick, whole state when it is started over)
  const playSfx = useCallback((url: string, options?: unknown) => soundManager.playSfx?.(url, options as never), [soundManager]);
  useMissionSync(onEvent as never, setMiningSession as never, playSfx);

  // Asks what missions a new run of this mode offers (the modal shows them before the map is made)
  const loadMissionOffers = useCallback(
    async (mode: MiningGameMode): Promise<MissionOffersResponse> => {
      const result = await sendGameEvent({ type: 'mining_mission_offers', mode });
      if (!result.success) throw new Error(result.error || 'Could not load the missions');
      return result.data as MissionOffersResponse;
    },
    [sendGameEvent]
  );

  // Start Expedition Session with chosen mode
  const handleStartExpedition = useCallback(
    async (mode: MiningGameMode, forceNew = false, biomeKeys?: string[], missionId?: string) => {
      setShowModeModal(false);
      try {
        setLoading(true);
        setIsAssetsLoaded(false);
        const result = await sendGameEvent(miningStartEvent(mode, forceNew, biomeKeys, missionId));

        if (result.success && result.data?.sessionState) {
          isCleanedUpRef.current = false;
          setMiningSession(result.data.sessionState);
          setSessionKey((prev) => prev + 1);
          setAtExit(false);
          setShowExitConfirmation(false);
          selectSlot(0).catch(() => {});
          soundManager.startSessionBgm();
        } else {
          isCleanedUpRef.current = true;
          notificationService.error('Mining Error', result.error || 'Failed to start mining session');
          navigate('/home');
        }
      } catch (err: any) {
        isCleanedUpRef.current = true;
        console.error('[MineView] Start session error:', err);
        notificationService.error('Error', err.message || 'Could not connect to mining server');
        navigate('/home');
      } finally {
        setLoading(false);
      }
    },
    [sendGameEvent, setMiningSession, navigate, selectSlot]
  );

  // Mount/Session Initialization Check
  useEffect(() => {
    if (!activeCharacter) {
      navigate('/home');
      return;
    }
    // (while the run's results or spoils are on screen the mode picker waits: closing them goes home)
    if (!miningSession && !showSummaryModal) {
      setLoading(false);
      setShowModeModal(true);
    }
  }, [activeCharacter?.id, navigate, miningSession, showSummaryModal]);

  // Pressing E (or clicking the prompt) at the extraction point asks to leave; nothing pops up on its own
  const canAskToLeave = atExit && !showExitConfirmation && !showSummaryModal && !showModeModal;
  const askToLeave = useCallback(() => setShowExitConfirmation(true), []);
  useExitKey(canAskToLeave, askToLeave);

  // Safe Extraction Handler
  const handleExit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendGameEvent({ type: 'mining_exit' });
      if (result.success) {
        isCleanedUpRef.current = true;
        if (miningSession?.gameMode === 'sandbox') {
          // Nothing is saved in the sandbox, so there are no spoils to show
          setMiningSession(null);
          navigate('/home');
          return;
        }
        const items = result.data?.extractedItems || [];
        setSummaryLoot(items);
        setMiningSession(null);
        setSummaryMission((result.data?.mission as MissionResultView | undefined) ?? null);
        setSummaryEnded(null);
        setShowSummaryModal(true);
      } else {
        notificationService.error('Extraction Failed', result.error || 'Cannot extract');
      }
    } catch (err: any) {
      console.error('[MineView] Extraction error:', err);
      notificationService.error('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [sendGameEvent, setMiningSession, miningSession?.gameMode, navigate]);

  // Restart / New Game Handler
  const handleRestart = useCallback(() => {
    setShowExitConfirmation(false);
    setShowModeModal(true);
  }, []);

  const runSummary = buildRunSummary(summaryLoot, summaryMission);

  if (!activeCharacter || !playerState) {
    return null;
  }

  const handleAssetsLoaded = useCallback(() => {
    setIsAssetsLoaded(true);
    // Tell the server the mine is on screen once the loading screen has gone, so the extractor lands where it can be seen
    window.setTimeout(() => {
      sendGameEvent({ type: 'mining_client_ready' }).catch(() => {});
    }, LOADING_SCREEN_EXIT_MS);
  }, [sendGameEvent]);

  const isScreenLoading = loading || !isAssetsLoaded || !miningSession;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden h-full">
      {/* Background layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 pointer-events-none" />

      {/* Atmospheric Loading Screen Overlay */}
      <MiningLoadingScreen
        isLoading={isScreenLoading}
        progress={isAssetsLoaded ? 1 : loadProgress}
        message="Entering Dungeon Mine..."
        subMessage="Rigging equipment, lighting cavern depths & generating veins..."
      />

      {/* PixiJS Visual Stage */}
      {miningSession && (
        <PixiStageProvider key={sessionKey} className="flex-1 relative flex overflow-hidden">
          <MiningGrid
            sessionState={miningSession}
            playerState={playerState}
            onExit={handleExit}
            onAssetsLoaded={handleAssetsLoaded}
            onLoadProgress={setLoadProgress}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            isPlacingTorch={isPlacingTorch}
            onTorchPlaced={handleTorchPlaced}
            isPlacingLadder={isPlacingLadder}
            onLadderPlaced={handleLadderPlaced}
            isPlacingBridge={isPlacingBridge}
            isThrowingDynamite={isThrowingDynamite}
            isThrowingItem={isThrowingItem}
            activeThrowableItem={activeThrowableItem}
            onDynamiteThrown={handleDynamiteThrown}
            showDebug={showDebug}
            onToggleDebug={handleToggleDebug}
            onVisionChange={handleVisionChange}
            onBackpackChange={handleBackpackChange}
            onBackpackFull={handleBackpackFull}
            onStashChange={handleStashChange}
            onBeltChange={handleBeltChange}
            onAtExitChange={setAtExit}
            sandbox={sandbox.view}
          />
        </PixiStageProvider>
      )}

      {/* HTML HUD Overlay */}
      {miningSession && (
        <MiningHUD
          sessionState={miningSession}
          playerState={playerState}
          onRestart={handleRestart}
          isRestarting={loading}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          showDebug={showDebug}
          onToggleDebug={handleToggleDebug}
        />
      )}

      {/* "Press E to leave the mine", only while standing at the extraction point */}
      {miningSession && miningSession.gameMode !== 'sandbox' && !showExitConfirmation && (
        <ExitPrompt visible={atExit} onLeave={askToLeave} />
      )}

      {/* Sandbox tool panel */}
      {miningSession && sandbox.info && (
        <SandboxPanel
          fluids={(miningSession.fluids ?? []).map((f) => ({ typeKey: f.typeKey, name: f.name }))}
          gases={(miningSession.gases ?? []).map((g) => ({ typeKey: g.typeKey, name: g.name }))}
          mobs={sandbox.info.mobs}
          tool={sandbox.tool}
          onToolChange={sandbox.setTool}
          freeCamera={sandbox.freeCamera}
          onFreeCameraChange={sandbox.setFreeCamera}
          status={sandbox.status}
          onGodMode={sandbox.setGodMode}
          onPausedChange={sandbox.setPaused}
          onStep={sandbox.step}
          onSpeedChange={sandbox.setSpeed}
          onClearHazards={sandbox.clearHazards}
          extractor={{
            scenes: sandbox.info.extractorScenes ?? [],
            onSpawn: sandbox.spawnExtractor,
            onDigBelt: sandbox.digBelt,
            onSetCapacity: sandbox.setCapacity,
            onFillBackpack: sandbox.fillBackpack,
            onLoadScene: sandbox.loadExtractorScene,
          }}
          doodads={
            sandbox.info.doodads
              ? {
                  options: sandbox.info.doodads,
                  scenes: sandbox.info.doodadScenes ?? [],
                  generated: sandbox.status.doodadsGenerated === true,
                  onSetGeneration: sandbox.setDoodadGeneration,
                  onClear: sandbox.clearDoodads,
                  onLoadScene: sandbox.loadDoodadScene,
                }
              : undefined
          }
          missions={{
            options: sandbox.info.missions ?? [],
            scenes: sandbox.info.missionScenes ?? [],
            active: Boolean(miningSession.mission),
            onStart: sandbox.startMission,
            onControl: sandbox.missionControl,
            onLoadScene: sandbox.loadMissionScene,
          }}
          surface={{
            environments: sandbox.info.surfaceEnvironments ?? [],
            environment: sandbox.status.surfaceEnvironment,
            scenes: sandbox.info.surfaceScenes ?? [],
            forcedWeather: sandbox.status.forcedWeather ?? null,
            onSetEnvironment: sandbox.setSurfaceEnvironment,
            onSetWeather: sandbox.setWeather,
            onLightning: sandbox.triggerLightning,
            onLoadScene: sandbox.loadSurfaceScene,
          }}
          onReset={sandbox.reset}
          onLeave={handleExit}
          busy={sandbox.busy}
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
            You are at the extraction point. Would you like to safely extract all items in your temporary loot sack and leave the mine?
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

      {/* The Expedition Summary: the run's only end screen (loot, Sol and XP, and how the mission went) */}
      <LootSpoilsModal
        isOpen={showSummaryModal}
        onClose={() => {
          setShowSummaryModal(false);
          setSummaryLoot([]);
          setSummaryMission(null);
          setSummaryEnded(null);
          navigate('/home');
        }}
        title={
          <span className={`flex items-center gap-2 ${summaryEnded ? 'text-rose-400' : 'text-amber-400'}`}>
            {summaryEnded ? `⚠️ ${summaryEnded.title}` : '⛏️ Expedition Summary'}
          </span>
        }
        description={summaryEnded ? summaryEnded.message : 'You successfully extracted from the mine! Here are the spoils gathered:'}
        sol={runSummary.sol}
        experience={runSummary.experience}
        items={runSummary.items}
        acceptButtonText={summaryEnded ? 'Return Home' : 'Accept Spoils'}
        extra={<MissionSummary result={summaryMission} />}
      />

      {/* Choose Expedition Mode Modal (Solo vs Multiplayer) */}
      <ExpeditionModeModal
        isOpen={showModeModal}
        loadMissionOffers={loadMissionOffers}
        onSelectMode={(mode, options) => handleStartExpedition(mode, mode === 'singleplayer', options?.biomeKeys, options?.missionId)}
        onCancel={() => {
          setShowModeModal(false);
          navigate('/home');
        }}
      />
    </div>
  );
};
