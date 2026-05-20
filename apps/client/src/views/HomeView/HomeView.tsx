import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Application } from '@pixi/react';
import { Assets, Texture, Sprite, Application as PixiApplication } from 'pixi.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useChat } from '../../contexts/ChatContext';
import { useApi } from '../../hooks/useApi';
import { WorldMapModal } from '../../components/WorldMapModal/WorldMapModal';
import { DungeonModal } from '../../components/DungeonModal/DungeonModal';
import { ConfirmationModal } from '../../components/ConfirmationModal/ConfirmationModal';
import { notificationService } from '../../services/notificationService';
import { type GameCity, calculateTravelDays, calculateLevel } from '@nvg/shared';
import './HomeView.css';

// ----------------------------------------------------------------------------
// CityBackground — uses imperative Pixi stage API via onInit callback
// ----------------------------------------------------------------------------
const CityBackground = ({
  url,
  width,
  height,
  app,
}: {
  url?: string | null;
  width: number;
  height: number;
  app: PixiApplication | null;
}) => {
  const spriteRef = useRef<Sprite | null>(null);

  useEffect(() => {
    if (!url || !app?.stage) return;

    const fullUrl = url.startsWith('http')
      ? url
      : `${import.meta.env.VITE_API_URL}${url}`;

    let cancelled = false;

    Assets.load(fullUrl).then((texture: Texture) => {
      if (cancelled || !app?.stage) return;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = width / 2;
      sprite.y = height / 2;

      sprite.scale.set(Math.min(width / texture.width, height / texture.height));

      app.stage.addChild(sprite);
      spriteRef.current = sprite;
    });

    return () => {
      cancelled = true;
      if (spriteRef.current && app?.stage) {
        app.stage.removeChild(spriteRef.current);
        spriteRef.current.destroy();
        spriteRef.current = null;
      }
    };
  }, [url, width, height, app]);

  return null;
};

// ----------------------------------------------------------------------------
// HomeView
// ----------------------------------------------------------------------------
export const HomeView = () => {
  const { activeCharacter, setActiveCharacter, activeCity, playerState, cityDungeonInfo, setCityDungeonInfo } = useGame();
  const { sendGameEvent } = useSocket();
  const { setActiveTab } = useChat();
  const { fetchWithAuth } = useApi();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [switchingCity, setSwitchingCity] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showDungeonModal, setShowDungeonModal] = useState(false);
  const [showTravelConfirm, setShowTravelConfirm] = useState(false);
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);
  const [cities, setCities] = useState<GameCity[]>([]);
  const [enteringDungeon, setEnteringDungeon] = useState(false);
  const [pixiApp, setPixiApp] = useState<PixiApplication | null>(null);

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
      // Reset dungeon info since we changed cities
      setCityDungeonInfo(null);
    } catch (err: any) {
      console.error('[HomeView] Failed to travel:', err.message);
    } finally {
      setSwitchingCity(false);
    }
  };

  const handleSelectDungeon = async (dungeonLevelId: string) => {
    if (!activeCharacter) return;

    setEnteringDungeon(true);
    try {
      const result = await sendGameEvent({
        type: 'start_combat',
        cityId: activeCharacter.cityId,
        dungeonLevelId,
      });
      if (result.success) {
        setShowDungeonModal(false);
        navigate('/combat');
      } else {
        console.error('[HomeView] Failed to start combat:', result.error);
        notificationService.error('Cannot enter dungeon', result.error);
      }
    } catch (err: any) {
      console.error('[HomeView] Error starting combat:', err.message);
      notificationService.error('Error', err.message);
    } finally {
      setEnteringDungeon(false);
    }
  };

  const handleRest = async () => {
    try {
      const result = await sendGameEvent({ type: 'rest' });
      if (result.success) {
        notificationService.success('Rested', 'Health and stamina restored. 1 day has passed.');
      } else {
        notificationService.error('Cannot rest', result.error);
      }
    } catch (err: any) {
      notificationService.error('Error', err.message);
    }
  };

  if (!activeCharacter) return null;

  const cityName = city?.name ?? '...';

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
            disabled={cityLoading || switchingCity}
            onClick={handleRest}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded shadow-xl transition-all active:scale-95 border border-blue-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <span>Rest</span>
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

      {showDungeonModal && cityDungeonInfo && (
        <DungeonModal
          dungeonInfo={cityDungeonInfo}
          onSelectDungeon={handleSelectDungeon}
          onClose={() => setShowDungeonModal(false)}
          loading={enteringDungeon}
          characterLevel={calculateLevel(playerState?.attributes.experience ?? 0)}
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
              url={city?.backgroundImageUrl}
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
                  case 'DUNGEON': return '🏰';
                  case 'MINE': return '⛏️';
                  case 'FARM': return '🌾';
                  case 'MARKET': return '⚖️';
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
                    if (obj.type === 'DUNGEON') {
                      setShowDungeonModal(true);
                    } else if (obj.type === 'TRAINING_GROUNDS') {
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
