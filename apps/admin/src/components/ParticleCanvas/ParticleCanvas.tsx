import { useEffect, useRef, useState, useCallback } from 'react';
import { Application, Container } from 'pixi.js';
import type { ParticleEffectConfig } from '@mine-me/shared';
import { ParticleEngine, type EmitterHandle } from './ParticleEngine';
import './ParticleCanvas.css';

export interface ParticleCanvasProps {
  config: ParticleEffectConfig;
  width?: number;
  height?: number;
  className?: string;
  autoBurstInterval?: number; // In seconds, defaults to 2s for burst emitter types
}

type BackgroundTheme = 'dark' | 'black' | 'light' | 'checkerboard';

export default function ParticleCanvas({
  config,
  width = 520,
  height = 420,
  className = '',
  autoBurstInterval = 2.0,
}: ParticleCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const emitterHandleRef = useRef<EmitterHandle | null>(null);
  const autoBurstTimerRef = useRef<number | null>(null);

  const [bgTheme, setBgTheme] = useState<BackgroundTheme>('dark');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [fps, setFps] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(true);

  // Current config ref so ticker/listeners always see latest config
  const configRef = useRef(config);
  configRef.current = config;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Trigger burst at center or given point
  const triggerBurst = useCallback((point?: { x: number; y: number }) => {
    if (!engineRef.current) return;
    const spawnPt = point || { x: width / 2, y: height / 2 };
    engineRef.current.spawnBurst(configRef.current, spawnPt);
  }, [width, height]);

  // Handle canvas click to spawn or relocate
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !engineRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (configRef.current.emitterType === 'burst') {
      engineRef.current.spawnBurst(configRef.current, { x, y });
    } else if (emitterHandleRef.current) {
      emitterHandleRef.current.setPosition({ x, y });
    }
  };

  // Re-sync emitter when config changes
  useEffect(() => {
    if (!engineRef.current) return;

    // If continuous, recreate or update emitter
    if (emitterHandleRef.current) {
      emitterHandleRef.current.destroy();
      emitterHandleRef.current = null;
    }

    if (config.emitterType === 'continuous') {
      emitterHandleRef.current = engineRef.current.addEmitter(config, {
        x: width / 2,
        y: height / 2,
      });
    } else {
      // Immediate burst to see change
      engineRef.current.spawnBurst(config, { x: width / 2, y: height / 2 });
    }
  }, [config, width, height]);

  // Auto burst timer for burst-type emitters
  useEffect(() => {
    if (autoBurstTimerRef.current) {
      window.clearInterval(autoBurstTimerRef.current);
      autoBurstTimerRef.current = null;
    }

    if (config.emitterType === 'burst' && isPlaying && autoBurstInterval > 0) {
      autoBurstTimerRef.current = window.setInterval(() => {
        triggerBurst();
      }, autoBurstInterval * 1000);
    }

    return () => {
      if (autoBurstTimerRef.current) {
        window.clearInterval(autoBurstTimerRef.current);
        autoBurstTimerRef.current = null;
      }
    };
  }, [config.emitterType, isPlaying, autoBurstInterval, triggerBurst]);

  // Initialize Pixi application
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let appInstance: Application | null = null;
    let fpsCounter = 0;
    let fpsTimer = 0;

    const initPixi = async () => {
      try {
        setLoading(true);
        const app = new Application();
        await app.init({
          backgroundAlpha: 0,
          antialias: false,
          roundPixels: true,
          width,
          height,
        });

        if (destroyed) {
          app.destroy({ removeView: true });
          return;
        }

        appInstance = app;
        appRef.current = app;

        if (containerRef.current) {
          containerRef.current.appendChild(app.canvas);
        }

        const particleContainer = new Container();
        app.stage.addChild(particleContainer);

        const engine = new ParticleEngine(particleContainer, app.renderer, 3000);
        engineRef.current = engine;

        // Set up initial emitter or burst
        if (configRef.current.emitterType === 'continuous') {
          emitterHandleRef.current = engine.addEmitter(configRef.current, {
            x: width / 2,
            y: height / 2,
          });
        } else {
          engine.spawnBurst(configRef.current, { x: width / 2, y: height / 2 });
        }

        // Add ticker loop
        app.ticker.add((ticker) => {
          if (!isPlayingRef.current) return;

          const deltaSec = ticker.deltaMS / 1000;
          engine.update(deltaSec);

          fpsCounter++;
          fpsTimer += deltaSec;
          if (fpsTimer >= 0.5) {
            setFps(Math.round(fpsCounter / fpsTimer));
            setActiveCount(engine.getActiveParticleCount());
            fpsCounter = 0;
            fpsTimer = 0;
          }
        });

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize ParticleCanvas Pixi app:', err);
        setLoading(false);
      }
    };

    initPixi();

    return () => {
      destroyed = true;
      if (emitterHandleRef.current) {
        emitterHandleRef.current.destroy();
        emitterHandleRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (appInstance) {
        appInstance.destroy({ removeView: true });
        appRef.current = null;
      }
    };
  }, [width, height]);

  const handleClear = () => {
    if (engineRef.current) {
      engineRef.current.clear();
      setActiveCount(0);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Viewport & Canvas Area */}
      <div
        className={`particle-canvas-wrapper particle-canvas-bg-${bgTheme} relative border border-slate-700/50`}
        style={{ width, height }}
      >
        <div
          ref={containerRef}
          onClick={handleCanvasClick}
          className="particle-canvas-viewport"
          title="Click to trigger burst or relocate emitter"
        />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs z-10">
            <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs text-slate-300 font-bold tracking-wider">
              Initializing Engine...
            </span>
          </div>
        )}

        {/* Top HUD overlay */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none z-10">
          <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-900/80 text-emerald-400 rounded-md border border-slate-700/60 shadow-sm backdrop-blur-xs">
            FPS: {fps}
          </span>
          <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-900/80 text-sky-400 rounded-md border border-slate-700/60 shadow-sm backdrop-blur-xs">
            Particles: {activeCount}
          </span>
        </div>

        {/* Crosshair target indicator in center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="w-6 h-6 border border-dashed border-white rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-white rounded-full" />
          </div>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-xs text-slate-300">
        {/* Left: Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="cursor-pointer px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-medium rounded transition-colors flex items-center gap-1"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>

          <button
            type="button"
            onClick={() => triggerBurst()}
            className="cursor-pointer px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-500 text-white font-semibold rounded shadow-xs transition-colors flex items-center gap-1"
          >
            💥 Trigger Burst
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="cursor-pointer px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-medium rounded transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Right: Background Contrast Switcher */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 text-[11px] mr-1">Background:</span>
          {(['dark', 'black', 'light', 'checkerboard'] as BackgroundTheme[]).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => setBgTheme(theme)}
              className={`cursor-pointer px-2 py-0.5 text-[11px] rounded capitalize transition-all ${
                bgTheme === theme
                  ? 'bg-sky-600 text-white font-bold shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
