import { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/react';
import { Assets, Texture, Sprite, Application as PixiApplication } from 'pixi.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useApi } from '../../hooks/useApi';
import { CityPicker } from '../../components/CityPicker/CityPicker';
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
  const { activeCharacter, setActiveCharacter, activeCity, setActiveCity, playerState } = useGame();
  const { joinCity, leaveCity, onEvent } = useSocket();
  const { fetchWithAuth } = useApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [switchingCity, setSwitchingCity] = useState(false);
  const [pixiApp, setPixiApp] = useState<PixiApplication | null>(null);
  const cityIdRef = useRef<string | null>(null);
  const joinedCityIdRef = useRef<string | null>(null);

  // Derive city: prefer live activeCity (set by server events), fall back to
  // playerState.city (persisted across sessions), so we never show "Loading"
  // when we already have the data.
  const city: GameCity | null = activeCity ?? playerState?.city ?? null;
  const cityLoading = city === null;

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

  // city_data arrives after join_city — update activeCity.
  // We keep this handler because the server always emits it, and it may carry
  // fresher data than the cached playerState (e.g. after a city switch).
  useEffect(() => {
    const cleanup = onEvent('city_data', (incoming: GameCity) => {
      console.log('[HomeView] city_data received:', incoming.name);
      setActiveCity(incoming);
    });
    return cleanup;
  }, [onEvent, setActiveCity]);

  // Join city room on mount (or when cityId changes), leave on unmount.
  useEffect(() => {
    if (!activeCharacter?.cityId || !activeCharacter?.id) return;

    const cityId = activeCharacter.cityId;

    // Idempotency guard: prevent double-joining same city (Strict Mode remount).
    if (joinedCityIdRef.current === cityId) return;

    cityIdRef.current = cityId;
    joinedCityIdRef.current = cityId;

    // Join the websocket city room — the server will push city_data back.
    // We don't reset cityLoading here because we may already have city data
    // from playerState, so there's nothing to "load".
    joinCity(cityId, activeCharacter.id)
      .catch((err) => {
        console.error('[HomeView] Failed to join city:', err.message);
      });

    return () => {
      if (cityIdRef.current) {
        leaveCity(cityIdRef.current).catch(() => {});
        cityIdRef.current = null;
        // Intentionally NOT resetting joinedCityIdRef here — see comment above.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter?.cityId, activeCharacter?.id]);

  const handleCityChange = async (newCityId: string) => {
    if (!activeCharacter) return;

    const confirmTravel = window.confirm("Are you sure you want to travel to this city?");
    if (!confirmTravel) return;

    setSwitchingCity(true);
    try {
      const res = await fetchWithAuth(`/api/characters/${activeCharacter.id}/city`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cityId: newCityId })
      });
      if (!res.ok) throw new Error('Failed to switch city');

      const updatedCharacter = await res.json();
      setActiveCharacter(updatedCharacter);
    } catch (err) {
      console.error('[HomeView] Failed to travel:', err);
    } finally {
      setSwitchingCity(false);
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

        <div className="pointer-events-auto">
          <CityPicker
            currentCityId={activeCharacter.cityId}
            onCityChange={handleCityChange}
            disabled={cityLoading || switchingCity}
          />
        </div>
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
              url={city?.backgroundImageUrl}
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
