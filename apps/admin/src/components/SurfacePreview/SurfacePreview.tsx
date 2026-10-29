import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WEATHER_IDS, WEATHER_TYPES, flashOf, getAssetUrl, hash01, weatherAt, type SurfaceEnvironmentDefinition, type WeatherId } from '@mine-me/shared';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, drawSurfacePreview } from './drawSurfacePreview';
import './SurfacePreview.css';

/** Seconds a lightning flash is visible, and the preview's fixed seed (so the same environment always looks the same). */
const FLASH_VISIBLE_SECONDS = 0.7;
export const PREVIEW_SEED = 7;
const FRAME_MS = 33;

export interface SurfacePreviewProps {
  /** The environment as it is being edited. */
  environment: SurfaceEnvironmentDefinition;
}

const button = 'cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-lg transition-all';

/**
 * A strip of the surface to judge an environment by: drag it sideways to see the scenery scroll at its own speeds, pick a
 * weather (and how strong) to see the clouds, rain, snow, fog and dimming, and call a lightning strike. It is drawn with the
 * same shared maths the game uses (the weather, the clouds, the outlines), so what you see here is what the game shows.
 */
const SurfacePreview: React.FC<SurfacePreviewProps> = ({ environment }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement | null>());
  const cameraRef = useRef(0);
  const dragRef = useRef<{ x: number; camera: number } | null>(null);
  const strikeRef = useRef<{ at: number; x: number } | null>(null);
  const timeRef = useRef(0);
  const envRef = useRef(environment);
  envRef.current = environment;
  const [weather, setWeather] = useState<WeatherId>('clear');
  const [intensity, setIntensity] = useState(1);
  const [noCanvas, setNoCanvas] = useState(false);
  const [version, setVersion] = useState(0);
  const settings = useRef({ weather, intensity });
  settings.current = { weather, intensity };

  // The pictures the layers and clouds use, loaded once per url (a failure leaves the drawn silhouette in place)
  const pictureUrls = useMemo(() => environment.layers.map((l) => l.textureUrl).filter((u): u is string => Boolean(u)), [environment.layers]);
  useEffect(() => {
    for (const url of pictureUrls) {
      if (imagesRef.current.has(url)) continue;
      imagesRef.current.set(url, null);
      const image = new Image();
      image.onload = () => {
        imagesRef.current.set(url, image);
        setVersion((v) => v + 1);
      };
      image.onerror = () => undefined;
      image.src = getAssetUrl(url);
    }
  }, [pictureUrls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !ctx) {
      setNoCanvas(true);
      return;
    }
    setNoCanvas(false);
    const draw = () => {
      const t = timeRef.current;
      const env = envRef.current;
      const forced = { weather: settings.current.weather, intensity: settings.current.intensity };
      const state = weatherAt(PREVIEW_SEED, env, t, forced);
      const strike = strikeRef.current;
      const flash = strike ? flashOf(t - strike.at) : 0;
      if (strike && t - strike.at > FLASH_VISIBLE_SECONDS) strikeRef.current = null;
      drawSurfacePreview(ctx, env, { cameraX: cameraRef.current, time: t, weather: state, flash, strikeX: strike?.x ?? 0.5 }, imagesRef.current, PREVIEW_SEED);
    };
    draw();
    const timer = window.setInterval(() => {
      timeRef.current += FRAME_MS / 1000;
      draw();
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [version]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: e.clientX, camera: cameraRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging right moves the camera left, so the scenery follows the pointer
    cameraRef.current = drag.camera - (e.clientX - drag.x);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  // Each strike lands somewhere else along the picture
  const strikeCount = useRef(0);
  const strike = () => {
    strikeCount.current += 1;
    strikeRef.current = { at: timeRef.current, x: 0.15 + 0.7 * hash01(PREVIEW_SEED, strikeCount.current, 3) };
  };

  return (
    <div className="surface-preview space-y-3" data-testid="surface-preview">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Preview</h4>
        <p className="text-xs text-slate-500 font-medium">Drag the picture sideways to scroll the scenery. Pick a weather to see how it looks, and call a strike to test the lightning.</p>
      </div>
      {noCanvas ? (
        <p className="text-xs font-semibold text-slate-500">This browser cannot draw the preview.</p>
      ) : (
        <canvas
          ref={canvasRef}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          aria-label="Surface preview"
          className="w-full rounded-xl border border-slate-200 bg-slate-900 cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Preview weather" value={weather} onChange={(e) => setWeather(e.target.value as WeatherId)} className="cursor-pointer px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
          {WEATHER_IDS.map((id) => (
            <option key={id} value={id}>
              {WEATHER_TYPES[id].label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Strength
          <input type="range" aria-label="Preview weather strength" min={0} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="cursor-pointer" />
          <span className="w-9 font-mono text-right">{Math.round(intensity * 100)}%</span>
        </label>
        <button type="button" onClick={strike} className={button}>
          Lightning strike
        </button>
        <button
          type="button"
          onClick={() => {
            cameraRef.current = 0;
          }}
          className={button}
        >
          Reset view
        </button>
      </div>
    </div>
  );
};

export default SurfacePreview;
