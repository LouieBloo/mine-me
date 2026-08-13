import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Application } from '@pixi/react';
import { Texture, Sprite, Application as PixiApplication } from 'pixi.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useChat } from '../../contexts/ChatContext';
import { useApi } from '../../hooks/useApi';
import { WorldMapModal } from '../../components/WorldMapModal/WorldMapModal';
import { ConfirmationModal } from '../../components/ConfirmationModal/ConfirmationModal';
import { notificationService } from '../../services/notificationService';
import { type GameCity, calculateTravelDays, getStaminaRecoveryPerDay, calculateRestDaysToFull } from '@mine-me/shared';
import './HomeView.css';

// ----------------------------------------------------------------------------
// CityBackground — uses imperative Pixi stage API via onInit callback
// ----------------------------------------------------------------------------
const CityBackground = ({
  width,
  height,
  app,
}: {
  width: number;
  height: number;
  app: PixiApplication | null;
}) => {
  const spriteRef = useRef<Sprite | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dimsRef = useRef({ width, height });

  useEffect(() => {
    dimsRef.current = { width, height };
  }, [width, height]);

  useEffect(() => {
    if (!app?.stage) return;

    const videoUrl = `${import.meta.env.VITE_API_URL || ''}/assets/testscreen.mp4`;

    const videoElement = document.createElement('video');
    videoElement.src = videoUrl;
    videoElement.crossOrigin = 'anonymous';
    videoElement.muted = true;
    videoElement.loop = true;
    videoElement.playsInline = true;
    videoElement.autoplay = true;
    videoElement.controls = false;
    videoElement.style.display = 'none';

    videoRef.current = videoElement;

    let sprite: Sprite | null = null;

    const onCanPlay = () => {
      if (!app?.stage || spriteRef.current) return;

      const texture = Texture.from(videoElement);
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);

      const { width: curWidth, height: curHeight } = dimsRef.current;
      sprite.x = curWidth / 2;
      sprite.y = curHeight / 2;

      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        sprite.scale.set(Math.min(curWidth / videoElement.videoWidth, curHeight / videoElement.videoHeight));
      }

      app.stage.addChild(sprite);
      spriteRef.current = sprite;
    };

    videoElement.addEventListener('canplay', onCanPlay);
    if (videoElement.readyState >= 2) {
      onCanPlay();
    } else {
      videoElement.load();
    }

    videoElement.play().catch((err) => {
      console.warn('[CityBackground] Video playback failed:', err);
    });

    return () => {
      videoElement.removeEventListener('canplay', onCanPlay);
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();
      videoRef.current = null;

      if (sprite && app?.stage) {
        app.stage.removeChild(sprite);
        const texture = sprite.texture;
        sprite.destroy();
        if (texture) {
          texture.destroy(true);
        }
        spriteRef.current = null;
      }
    };
  }, [app]);

  useEffect(() => {
    const sprite = spriteRef.current;
    const video = videoRef.current;
    if (sprite && video) {
      sprite.x = width / 2;
      sprite.y = height / 2;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        sprite.scale.set(Math.min(width / video.videoWidth, height / video.videoHeight));
      }
    }
  }, [width, height]);

  return null;
};

// ----------------------------------------------------------------------------
// HomeView
// ----------------------------------------------------------------------------
export const HomeView = () => {
  const { activeCharacter, setActiveCharacter, activeCity, playerState } = useGame();
  const { sendGameEvent } = useSocket();
  const { setActiveTab } = useChat();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [switchingCity, setSwitchingCity] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showTravelConfirm, setShowTravelConfirm] = useState(false);
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);
  const [cities, setCities] = useState<GameCity[]>([]);
  const [pixiApp, setPixiApp] = useState<PixiApplication | null>(null);
  const [resting, setResting] = useState(false);

  // Derive city: prefer live activeCity (set by server events), fall back to
  // playerState.city (persisted across sessions), so we never show "Loading"
  // when we already have the data.
  const city: GameCity | null = activeCity ?? playerState?.city ?? null;
  const cityLoading = city === null;

  // Auto-select City chat tab when entering HomeView
  useEffect(() => {
    setActiveTab('City');
  }, [setActiveTab]);

  // Track container size for the Pixi canvas
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    const ro = new ResizeObserver(updateDimensions);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch all cities on mount for the map
  useEffect(() => {
    let active = true;
    fetchWithAuth('/api/game/cities')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (active && data) {
          setCities(data);
        }
      })
      .catch(err => console.error('[HomeView] Failed to fetch cities:', err));
    return () => { active = false; };
  }, [fetchWithAuth]);


  const handleCityChange = (newCityId: string) => {
    if (!activeCharacter) return;
    setPendingCityId(newCityId);
    setShowTravelConfirm(true);
  };

  const handleConfirmTravel = async () => {
    if (!activeCharacter || !pendingCityId) return;

    setSwitchingCity(true);
    try {
      const result = await sendGameEvent({ type: 'change_city', cityId: pendingCityId });

      // Update local activeCharacter with the new cityId
      setActiveCharacter({ ...activeCharacter, cityId: pendingCityId, ageInDays: result.data?.ageInDays ?? activeCharacter.ageInDays });
      setShowMapModal(false);
      setShowTravelConfirm(false);
      setPendingCityId(null);
    } catch (err: any) {
      console.error('[HomeView] Failed to travel:', err.message);
    } finally {
      setSwitchingCity(false);
    }
  };

  const handleRestDays = async (days: number) => {
    setResting(true);
    try {
      const result = await sendGameEvent({ type: 'rest', days });
      if (result.success) {
        if (result.data?.died) {
          notificationService.error('Passed Away', 'Your character has passed away of old age (lived 36,000+ days).');
          setActiveCharacter(null);
          navigate('/characters');
        } else {
          notificationService.success(
            'Rested',
            `Rested for ${days} ${days === 1 ? 'day' : 'days'}. Health and stamina restored.`
          );
        }
      } else {
        notificationService.error('Cannot rest', result.error);
      }
    } catch (err: any) {
      notificationService.error('Error', err.message);
    } finally {
      setResting(false);
    }
  };

  if (!activeCharacter) return null;

  const cityName = city?.name ?? '...';

  const characterInput = playerState ? {
    stamina: playerState.attributes.stamina,
    maxStamina: playerState.attributes.maxStamina,
    class: playerState.characterClass,
    profession: playerState.profession,
  } : null;

  const recoveryPerDay = characterInput ? getStaminaRecoveryPerDay(characterInput) : 25;
  const currentStamina = playerState?.attributes.stamina ?? 0;
  const maxStamina = playerState?.attributes.maxStamina ?? 0;
  const staminaToRecover1Day = Math.min(recoveryPerDay, maxStamina - currentStamina);

  const { daysNeeded } = characterInput 
    ? calculateRestDaysToFull(characterInput) 
    : { daysNeeded: 0 };

  return (
    <div className="flex-1 relative flex flex-col h-full bg-slate-900 border-x border-slate-800 overflow-hidden">
      {/* City Name Header */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-950/80 to-transparent z-10 flex items-center px-10 pointer-events-none justify-between">
        <h1 className="text-4xl font-black tracking-[0.2em] text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase">
          {cityLoading ? (
            <span className="opacity-50 animate-pulse">Loading...</span>
          ) : cityName}
        </h1>

        <div className="pointer-events-auto flex items-center space-x-4">

          <button
            disabled={cityLoading || switchingCity || resting}
            onClick={() => handleRestDays(1)}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded shadow-xl transition-all active:scale-95 border border-blue-400 cursor-pointer"
          >
            {resting ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Resting...</span>
              </span>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Rest 1 Day ({staminaToRecover1Day} Stamina)</span>
              </>
            )}
          </button>

          <button
            disabled={cityLoading || switchingCity || resting || daysNeeded <= 0}
            onClick={() => handleRestDays(daysNeeded)}
            className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded shadow-xl transition-all active:scale-95 border border-indigo-400 cursor-pointer"
          >
            {resting ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Resting...</span>
              </span>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
                <span>Full Rest ({daysNeeded} days, full stamina)</span>
              </>
            )}
          </button>

          <button
            disabled={cityLoading || switchingCity}
            onClick={() => setShowMapModal(true)}
            className="flex items-center space-x-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded shadow-xl transition-all active:scale-95 border border-amber-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>Open Map</span>
          </button>
        </div>
      </div>

      {showMapModal && (
        <WorldMapModal
          cities={cities}
          currentCityId={activeCharacter.cityId}
          onCityTravel={handleCityChange}
          onClose={() => setShowMapModal(false)}
          loading={switchingCity}
        />
      )}

      {/* PixiJS Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full bg-slate-950 relative overflow-hidden">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Application
            width={dimensions.width}
            height={dimensions.height}
            background="#020617"
            antialias={true}
            onInit={(app) => setPixiApp(app)}
          >
            <CityBackground
              width={dimensions.width}
              height={dimensions.height}
              app={pixiApp}
            />
          </Application>
        )}

        {/* City Objects Overlay (HTML buttons) */}
        {!cityLoading && city?.objectCoordinates && city.objectCoordinates.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {city.objectCoordinates.map((obj, index) => {
              const getIcon = (type: string) => {
                switch (type) {
                  case 'MINE': return '⛏️';
                  case 'FARM': return '🌾';
                  case 'MARKET': return '秤';
                  case 'TRAINING_GROUNDS': return '⚔️';
                  default: return '📍';
                }
              };

              return (
                <button
                  key={index}
                  className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-all hover:scale-110 active:scale-95"
                  style={{ left: `${obj.x}%`, top: `${obj.y}%` }}
                  onClick={() => {
                    if (obj.type === 'TRAINING_GROUNDS') {
                      navigate('/training');
                    } else if (obj.type === 'MINE') {
                      navigate('/mine');
                    } else {
                      console.log(`[HomeView] Clicked ${obj.type}: ${obj.label}`);
                    }
                  }}
                >
                  <div className="w-12 h-12 bg-slate-900/80 backdrop-blur-md border-2 border-amber-500/50 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.2)] flex items-center justify-center text-2xl group-hover:border-amber-400 group-hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all">
                    {getIcon(obj.type)}
                  </div>
                  <div className="mt-2 px-3 py-1 bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded text-xs font-black text-white uppercase tracking-[0.1em] shadow-xl group-hover:border-slate-700 transition-all">
                    {obj.label}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom vignette */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950/60 to-transparent pointer-events-none z-10" />

      {/* Confirmation Modal */}
      {(() => {
        const targetCity = cities.find(c => c.id === pendingCityId);
        const travelDays = targetCity && city ? calculateTravelDays(city, targetCity) : 0;

        return (
          <ConfirmationModal
            isOpen={showTravelConfirm}
            onClose={() => setShowTravelConfirm(false)}
            onConfirm={handleConfirmTravel}
            isLoading={switchingCity}
            title="Travel Confirmation"
            message={`Are you sure you want to travel to ${targetCity?.name || 'this city'}? The journey will take ${travelDays} days.`}
            confirmLabel="Fast Travel"
            cancelLabel="Stay Here"
            variant="primary"
          />
        );
      })()}
    </div>
  );
};
