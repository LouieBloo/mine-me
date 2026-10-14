import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FLUID_APPEARANCE, FluidDisplay, FluidLayout, MINING_CONFIG, bandBelowLine, colorToCss, darkenColor, fluidBodyBands, fluidDepthShade,
  fluidSurfaceWave, lightenColor, parseHexColor, type FluidAppearance, type FluidLevels,
} from '@mine-me/shared';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PreviewScene } from './previewScene';
import './FluidPreview.css';

const TILE_PX = 28;
/** How often the game steps its fluid, in ms. */
export const PREVIEW_STEP_MS = Math.round((MINING_CONFIG.FLUID_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE) * 1000);

/** How often the picture is redrawn so the waves move smoothly, in ms (the simulation steps more slowly than this). */
export const PREVIEW_FRAME_MS = 33;

export interface FluidPreviewSettings {
  color: string;
  opacity: number;
  /** Waves, highlight and depth shading. Absent: the defaults. */
  appearance?: FluidAppearance;
  density: number;
  flowRate: number;
  minLevel: number;
  flowThreshold: number;
}

type DrawContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'fillRect' | 'fillStyle' | 'globalAlpha' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'strokeStyle' | 'lineWidth'
>;

/** Fills a flat polygon (x0, y0, x1, y1, ...). */
function fillPolygon(ctx: DrawContext, points: number[], style: string): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/**
 * Draws the tank: terrain, then the fluid through the same shapes the game uses (sloped joined surface,
 * waves at `timeSec`, depth shading, streams), so what is tuned here is what the game shows. `levels` is what
 * to draw (the eased display, like the game); without it the tank's exact levels are drawn.
 */
export function drawPreview(
  ctx: DrawContext,
  scene: PreviewScene,
  look: Pick<FluidPreviewSettings, 'color' | 'opacity' | 'appearance'>,
  tile: number = TILE_PX,
  timeSec = 0,
  levels: FluidLevels = scene.toField()
): void {
  const appearance = look.appearance ?? DEFAULT_FLUID_APPEARANCE;
  const color = parseHexColor(look.color);
  const highlight = lightenColor(color, 0.45);
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
  const layout = new FluidLayout(levels, tile, (x, y) => scene.isSolid(x, y));
  for (let y = 0; y < PREVIEW_HEIGHT; y++) {
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      for (const shape of layout.shapesAt(x, y)) {
        for (const band of fluidBodyBands(shape, tile, appearance)) {
          const shade = fluidDepthShade(look.opacity, appearance, band.depth);
          fillPolygon(ctx, band.points, colorToCss(darkenColor(color, shade.darken), shade.opacity));
        }
        if (shape.stream) {
          ctx.fillStyle = colorToCss(highlight, look.opacity * appearance.highlight * 0.5);
          ctx.fillRect(shape.x + shape.width * 0.15, shape.top, shape.width * 0.2, shape.bottom - shape.top);
        }
        const wave = fluidSurfaceWave(shape, tile, timeSec, appearance);
        if (!wave) continue;
        const shade = fluidDepthShade(look.opacity, appearance, shape.depth + 0.125);
        if (wave.fill.length > 0) fillPolygon(ctx, wave.fill, colorToCss(darkenColor(color, shade.darken), shade.opacity));
        if (appearance.highlight <= 0) continue;
        for (let band = 3; band >= 1; band--) {
          fillPolygon(ctx, bandBelowLine(wave.line, (band * tile) / 32, shape.bodyBottom), colorToCss(highlight, look.opacity * appearance.highlight * 0.1));
        }
        ctx.beginPath();
        ctx.moveTo(wave.line[0], wave.line[1]);
        for (let i = 2; i < wave.line.length; i += 2) ctx.lineTo(wave.line[i], wave.line[i + 1]);
        ctx.strokeStyle = colorToCss(highlight, look.opacity * Math.min(1, appearance.highlight * 1.2));
        ctx.lineWidth = Math.max(1, tile / 32);
        ctx.stroke();
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
  const look = useRef({ color: fluid.color, opacity: fluid.opacity, appearance: fluid.appearance });
  look.current = { color: fluid.color, opacity: fluid.opacity, appearance: fluid.appearance };
  const startedAt = useRef(Date.now());
  const [pouring, setPouring] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [stats, setStats] = useState(scene.stats());
  // What is drawn: the tank's levels eased between steps, exactly as the game draws them
  const display = useMemo(() => new FluidDisplay(PREVIEW_WIDTH, PREVIEW_HEIGHT), [scene]);
  const syncDisplay = (now: boolean) => {
    const field = scene.toField();
    for (let y = 0; y < PREVIEW_HEIGHT; y++) {
      for (let x = 0; x < PREVIEW_WIDTH; x++) {
        if (now) display.setNow(x, y, field.getFluidId(x, y), field.getLevel(x, y));
        else display.setTarget(x, y, field.getFluidId(x, y), field.getLevel(x, y));
      }
    }
  };

  useEffect(() => {
    setPouring(false);
    setGateOpen(false);
  }, [scene]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPreview(ctx, scene, look.current, TILE_PX, (Date.now() - startedAt.current) / 1000, display);
  };

  useEffect(() => {
    syncDisplay(true);
    draw();
    const stepper = setInterval(() => {
      scene.step();
      syncDisplay(false);
      setStats(scene.stats());
    }, PREVIEW_STEP_MS);
    // Redrawn faster than it steps, so the fluid flows and the waves move smoothly
    const painter = setInterval(() => {
      display.step(PREVIEW_FRAME_MS / 1000);
      draw();
    }, PREVIEW_FRAME_MS);
    return () => {
      clearInterval(stepper);
      clearInterval(painter);
    };
  }, [scene]);

  // Look changes show straight away, without resetting the tank
  useEffect(draw, [fluid.color, fluid.opacity, fluid.appearance]);

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
    syncDisplay(true);
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
