import React, { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/react';
import { Assets, Texture } from 'pixi.js';
import { type GameCity, calculateTravelDays } from '@mine-me/shared';
import { Modal } from '../Modal/Modal';
import './WorldMapModal.css';

interface WorldMapModalProps {
  cities: GameCity[];
  currentCityId?: string;
  onCityTravel: (cityId: string) => void;
  onClose: () => void;
  loading?: boolean;
}

const MapBackground = ({
  width,
  height,
  texture,
}: {
  width: number;
  height: number;
  texture: Texture;
}) => {
  const scale = Math.max(width / texture.width, height / texture.height);

  return (
    // @ts-ignore
    <sprite
      texture={texture}
      anchor={0.5}
      x={width / 2}
      y={height / 2}
      scale={scale}
    />
  );
};

const TravelNetwork = ({
  cities,
  currentCityId,
  width,
  height,
}: {
  cities: GameCity[];
  currentCityId?: string;
  width: number;
  height: number;
}) => {
  const currentCity = cities.find((c) => c.id === currentCityId);

  return (
    <>
      {/* 1. Subtle global network lines — faint background mesh */}
      {/* @ts-ignore */}
      <graphics
        draw={(g: any) => {
          g.clear();
          // In Pixi v8 the correct pattern is: set style, then draw paths, then .stroke()
          g.setStrokeStyle({ width: 2, color: 0x475569, alpha: 0.12 });
          g.beginPath();
          for (let i = 0; i < cities.length; i++) {
            for (let j = i + 1; j < cities.length; j++) {
              const c1 = cities[i];
              const c2 = cities[j];
              const x1 = ((c1.worldPositionX ?? 50) / 100) * width;
              const y1 = ((c1.worldPositionY ?? 50) / 100) * height;
              const x2 = ((c2.worldPositionX ?? 50) / 100) * width;
              const y2 = ((c2.worldPositionY ?? 50) / 100) * height;
              g.moveTo(x1, y1);
              g.lineTo(x2, y2);
            }
          }
          g.stroke();
        }}
      />

      {/* 2. Highlighted connections from current city + labels */}
      {currentCity && (
        <>
          {/* @ts-ignore */}
          <graphics
            draw={(g: any) => {
              g.clear();
              g.setStrokeStyle({ width: 4, color: 0xd97706, alpha: 0.5 });

              const x1 = ((currentCity.worldPositionX ?? 50) / 100) * width;
              const y1 = ((currentCity.worldPositionY ?? 50) / 100) * height;

              g.beginPath();
              cities.forEach((target) => {
                if (target.id === currentCityId) return;
                const x2 = ((target.worldPositionX ?? 50) / 100) * width;
                const y2 = ((target.worldPositionY ?? 50) / 100) * height;
                g.moveTo(x1, y1);
                g.lineTo(x2, y2);
              });
              g.stroke();
            }}
          />

          {cities.map((target) => {
            if (target.id === currentCityId) return null;

            const days = calculateTravelDays(currentCity, target);
            const x1 = ((currentCity.worldPositionX ?? 50) / 100) * width;
            const y1 = ((currentCity.worldPositionY ?? 50) / 100) * height;
            const x2 = ((target.worldPositionX ?? 50) / 100) * width;
            const y2 = ((target.worldPositionY ?? 50) / 100) * height;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const textStyle = {
              align: 'center',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 30,
              fontWeight: 'bold',
              fill: '#fcd34d',
              stroke: { color: '#000000', width: 6 },
              letterSpacing: 1,
            };

            return (
              /* @ts-ignore */
              <text
                key={`label-${target.id}`}
                {...({
                  text: `${days} days`,
                  x: midX,
                  y: midY,
                  anchor: 0.5,
                  style: textStyle,
                } as any)}
              />
            );
          })}
        </>
      )}
    </>
  );
};

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ cities, currentCityId, onCityTravel, onClose, loading }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mapTexture, setMapTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    Assets.load('/assets/cities/world_map.png').then(tex => {
      if (!cancelled) setMapTexture(tex);
    });
    return () => { cancelled = true; };
  }, []);

  // Use useLayoutEffect to capture dimensions immediately before paint
  React.useLayoutEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: clientWidth,
          height: clientHeight,
        });
      }
    };
    updateDimensions();
    const timer = setTimeout(updateDimensions, 100);
    const ro = new ResizeObserver(updateDimensions);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const getCityPositionStyles = (c: GameCity) => {
    const x = c.worldPositionX ?? 50;
    const y = c.worldPositionY ?? 50;
    return {
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      zIndex: c.id === currentCityId ? 50 : 10
    };
  };

  const mapIconFullUrl = (url: string | null | undefined) => {
    if (!url) return '/assets/cities/city_icon.png';
    if (url.startsWith('http')) return url;
    return `${import.meta.env.VITE_API_URL || ''}${url}`;
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="World Map"
      maxWidthClass="w-full max-w-6xl h-[80vh] min-h-[500px]"
      noPadding={true}
      hideHeader={true}
    >
      <div className="relative w-full h-full min-h-0 overflow-hidden bg-slate-950 rounded-b-2xl flex flex-col">
        {/* Pixi Canvas Layer */}
        <div
          ref={containerRef}
          className="relative w-full h-full flex-1 bg-slate-900 pointer-events-none"
        >
          {dimensions.width > 0 && dimensions.height > 0 && mapTexture ? (
            <Application
              width={dimensions.width}
              height={dimensions.height}
              background="#020617"
              antialias={true}
            >
              <MapBackground
                width={dimensions.width}
                height={dimensions.height}
                texture={mapTexture}
              />
              <TravelNetwork
                cities={cities}
                currentCityId={currentCityId}
                width={dimensions.width}
                height={dimensions.height}
              />
            </Application>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs uppercase tracking-widest font-bold">
              <div className="animate-pulse">
                {!mapTexture ? 'Loading Texture...' : 'Initializing Canvas...'}
              </div>
            </div>
          )}
        </div>

        {/* HTML Cities Layer */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {cities.map((c) => {
            const isCurrent = c.id === currentCityId;
            return (
              <div
                key={c.id}
                className="absolute pointer-events-auto flex flex-col items-center group map-button-city"
                style={getCityPositionStyles(c)}
              >
                <button
                  disabled={loading || isCurrent}
                  onClick={() => onCityTravel(c.id)}
                  className={`relative w-16 h-16 rounded-xl border-2 flex items-center justify-center overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-all ${isCurrent
                      ? 'border-emerald-400 ring-4 ring-emerald-500/30 cursor-default scale-110'
                      : 'border-slate-400 hover:border-amber-400 hover:scale-110 active:scale-95 cursor-pointer bg-slate-800'
                    }`}
                  title={isCurrent ? `You are currently in ${c.name}` : `Travel to ${c.name}`}
                >
                  <img
                    src={mapIconFullUrl(c.mapIconUrl)}
                    alt={c.name}
                    className="w-full h-full object-cover select-none"
                    draggable={false}
                  />
                  {isCurrent && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center">
                      <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border border-white m-1 shadow-black shadow animate-pulse" />
                    </div>
                  )}
                </button>
                <div className="mt-2 text-center pointer-events-none">
                  <span className={`px-3 py-1 rounded font-black tracking-widest text-xs uppercase shadow-black shadow transition-colors ${isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-900/90 text-slate-200 group-hover:bg-amber-600 group-hover:text-white'
                    }`}>
                    {c.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
