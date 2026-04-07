import { useEffect, useRef, useState, useCallback } from 'react';
import { Application } from '@pixi/react';
import { Assets, Texture, Sprite, Application as PixiApplication } from 'pixi.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useApi } from '../../hooks/useApi';
import type { GameCity } from '@nvg/shared';
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

      const textureRatio = texture.width / texture.height;
      const containerRatio = width / height;
      sprite.scale.set(
        containerRatio > textureRatio ? width / texture.width : height / texture.height
      );

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
  const { activeCharacter, activeCity, setActiveCity } = useGame();
  const { joinCity, leaveCity } = useSocket();
  const { fetchWithAuth } = useApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [cityLoading, setCityLoading] = useState(false);
  const [pixiApp, setPixiApp] = useState<PixiApplication | null>(null);
  const cityIdRef = useRef<string | null>(null);
  const joinedCityIdRef = useRef<string | null>(null);

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

  // Fetch full city data via HTTP after joining via socket
  const fetchCityData = useCallback(async (cityId: string) => {
    setCityLoading(true);
    try {
      const res = await fetchWithAuth(`/api/game/city/${cityId}`);
      if (!res.ok) throw new Error('Failed to fetch city');
      const city: GameCity = await res.json();
      setActiveCity(city);
    } catch (err) {
      console.error('[HomeView] Failed to fetch city data:', err);
    } finally {
      setCityLoading(false);
    }
  }, [fetchWithAuth, setActiveCity]);

  // Join city room on mount, leave on unmount
  useEffect(() => {
    if (!activeCharacter?.cityId || !activeCharacter?.id) return;

    const cityId = activeCharacter.cityId;
    
    // Prevent double-joining the same city in rapid succession (e.g. Strict Mode)
    if (joinedCityIdRef.current === cityId) return;

    cityIdRef.current = cityId;
    joinedCityIdRef.current = cityId;

    // 1. Join the websocket city room
    joinCity(cityId, activeCharacter.id)
      .then(() => {
        // 2. Fetch city data via HTTP
        return fetchCityData(cityId);
      })
      .catch((err) => {
        console.error('[HomeView] Failed to join city:', err.message);
      });

    return () => {
      if (cityIdRef.current) {
        leaveCity(cityIdRef.current).catch(() => {});
        cityIdRef.current = null;
        joinedCityIdRef.current = null;
      }
    };
  }, [activeCharacter?.cityId, activeCharacter?.id]);

  if (!activeCharacter) return null;

  const cityName = activeCity?.name ?? '...';

  return (
    <div className="flex-1 relative flex flex-col h-full bg-slate-900 border-x border-slate-800 overflow-hidden">
      {/* City Name Header */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-950/80 to-transparent z-10 flex items-center px-10 pointer-events-none">
        <h1 className="text-4xl font-black tracking-[0.2em] text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase">
          {cityLoading ? (
            <span className="opacity-50 animate-pulse">Loading...</span>
          ) : cityName}
        </h1>
      </div>

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
              url={activeCity?.backgroundImageUrl}
              width={dimensions.width}
              height={dimensions.height}
              app={pixiApp}
            />
          </Application>
        )}
      </div>

      {/* Bottom vignette */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950/60 to-transparent pointer-events-none z-10" />
    </div>
  );
};
