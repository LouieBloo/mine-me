import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MINING_CONFIG, layoutFluidCell } from '@mine-me/shared';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PreviewScene } from './previewScene';
import './FluidPreview.css';

const TILE_PX = 28;
/** How often the game steps its fluid, in ms. */
export const PREVIEW_STEP_MS = Math.round((MINING_CONFIG.FLUID_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE) * 1000);

export interface FluidPreviewSettings {
  color: string;
  opacity: number;
  density: number;
  flowRate: number;
  minLevel: number;
  flowThreshold: number;
}

/** Draws the tank: terrain, then the fluid through the same layout the game uses. */
export function drawPreview(
  ctx: Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle' | 'globalAlpha'>,
  scene: PreviewScene,
  look: Pick<FluidPreviewSettings, 'color' | 'opacity'>,
  tile: number = TILE_PX
): void {
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, PREVIEW_WIDTH * tile, PREVIEW_HEIGHT * tile);
  ctx.fillStyle = '#1e1208';
  ctx.fillRect(0, 0, PREVIEW_WIDTH * tile, PREVIEW_HEIGHT * tile);
  for (let y = 0; y < PREVIEW_HEIGHT; y++) {
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      if (scene.isSolid(x, y)) {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
  }
  const field = scene.toField();
  for (let y = 0; y < PREVIEW_HEIGHT; y++) {
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      const rect = layoutFluidCell(field, x, y, tile);
      if (!rect) continue;
      ctx.globalAlpha = look.opacity;
      ctx.fillStyle = look.color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (rect.surface) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = look.opacity * 0.35;
        ctx.fillRect(rect.x, rect.y, rect.width, Math.min(3, rect.height));
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A live tank running the real fluid simulation with the settings being edited. Changing a physics
 * setting starts a fresh tank (the new settings cannot be applied to fluid already poured).
 */
export const FluidPreview: React.FC<{ fluid: FluidPreviewSettings }> = ({ fluid }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { density, flowRate, minLevel, flowThreshold } = fluid;
  const scene = useMemo(
    () => new PreviewScene({ density, flowRate, minLevel, flowThreshold }),
    [density, flowRate, minLevel, flowThreshold]
  );
  const look = useRef({ color: fluid.color, opacity: fluid.opacity });
  look.current = { color: fluid.color, opacity: fluid.opacity };
  const [pouring, setPouring] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [stats, setStats] = useState(scene.stats());

  useEffect(() => {
    setPouring(false);
    setGateOpen(false);
  }, [scene]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPreview(ctx, scene, look.current);
  };

  useEffect(() => {
    draw();
    const timer = setInterval(() => {
      scene.step();
      draw();
      setStats(scene.stats());
    }, PREVIEW_STEP_MS);
    return () => clearInterval(timer);
  }, [scene]);

  // Colour and opacity changes show straight away, without resetting the tank
  useEffect(draw, [fluid.color, fluid.opacity]);

  const togglePour = () => {
    scene.setPouring(!pouring);
    setPouring(!pouring);
  };
  const openGate = () => {
    scene.openDivider();
    setGateOpen(true);
  };
  const reset = () => {
    scene.reset();
    setPouring(false);
    setGateOpen(false);
    setStats(scene.stats());
    draw();
  };

  const button = 'cursor-pointer px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="fluid-preview bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
      <div>
        <h4 className="font-black text-base tracking-wide text-sky-300">Live Preview</h4>
        <p className="text-xs text-slate-400">The real fluid simulation with the settings on this page. Pour it, open the gate, and see how it settles.</p>
      </div>
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH * TILE_PX}
        height={PREVIEW_HEIGHT * TILE_PX}
        aria-label="Fluid preview tank"
        className="w-full rounded-xl border border-slate-700"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={togglePour} aria-pressed={pouring} className={`${button} ${pouring ? 'bg-sky-500 hover:bg-sky-400 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}>
          {pouring ? 'Stop Pouring' : 'Pour'}
        </button>
        <button type="button" onClick={openGate} disabled={gateOpen} className={`${button} bg-slate-700 hover:bg-slate-600 text-slate-100`}>
          Open Gate
        </button>
        <button type="button" onClick={reset} className={`${button} bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600`}>
          Reset
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['In tank', stats.volume.toFixed(2)],
          ['Evaporated', stats.evaporated.toFixed(2)],
          ['Flowing cells', String(stats.activeCells)],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-800 rounded-lg py-2">
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="font-mono font-bold text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default FluidPreview;
