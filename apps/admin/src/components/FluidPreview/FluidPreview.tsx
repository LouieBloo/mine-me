import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FLUID_APPEARANCE, FluidDisplay, FluidLayout, MINING_CONFIG, bandBelowLine, colorToCss, darkenColor, fluidBodyBands, fluidDepthShade, fluidFlowStreaks,
  fluidSurfaceWave, lightenColor, parseHexColor, type FluidAppearance, type FluidLevels,
} from '@mine-me/shared';
import { DEFAULT_PREVIEW_SCENE, PREVIEW_SCENES, PreviewScene } from './previewScene';
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
  /** No longer used by the simulation (it works in whole units); old rows still carry them. */
  minLevel?: number;
  flowThreshold?: number;
}

/** How the game's lava looks next to the fluid being edited, in scenes that have both. */
const LAVA_LOOK = { color: '#e8501a', opacity: 0.95 };
/** And the game's oil, in the scene where it rests on the fluid being edited. */
const OIL_LOOK = { color: '#0b0b0d', opacity: 0.9 };
/** How bright the streaks running down a fall are, at full strength (the same as the game's). */
const FLOW_STREAK_ALPHA = 0.7;

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
 * Draws the scene: terrain, then the fluid through the same shapes the game uses (joined sloped surface, waves at
 * `timeSec`, depth shading, light streaks down the falls), so what is tuned here is what the game shows. `levels` is
 * what to draw (the eased display, like the game); without it the scene's exact levels are drawn.
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
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, scene.width * tile, scene.height * tile);
  ctx.fillStyle = '#1e1208';
  ctx.fillRect(0, 0, scene.width * tile, scene.height * tile);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      if (scene.isSolid(x, y)) {
        ctx.fillStyle = '#5b4636';
        ctx.fillRect(x * tile, y * tile, tile, tile);
      } else if (scene.scene.rows[y][x] === 'H') {
        ctx.fillStyle = '#8a6a3c';
        ctx.fillRect(x * tile + tile * 0.4, y * tile, tile * 0.2, tile);
      }
    }
  }
  const layout = new FluidLayout(levels, tile);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      for (const shape of layout.shapesAt(x, y)) {
        const own = shape.fluidId === scene.lavaId ? LAVA_LOOK : shape.fluidId === scene.oilId ? OIL_LOOK : look;
        const color = parseHexColor(own.color);
        const highlight = lightenColor(color, 0.45);
        for (const band of fluidBodyBands(shape, tile, appearance)) {
          const shade = fluidDepthShade(own.opacity, appearance, band.depth);
          fillPolygon(ctx, band.points, colorToCss(darkenColor(color, shade.darken), shade.opacity * shape.strength));
        }
        if (shape.falling && appearance.flowStreaks > 0) {
          ctx.fillStyle = colorToCss(highlight, own.opacity * appearance.flowStreaks * shape.strength * FLOW_STREAK_ALPHA);
          for (const streak of fluidFlowStreaks(x, y, tile, timeSec, appearance, shape.surface ? shape.topMid : shape.top)) {
            ctx.fillRect(streak.x, streak.y, streak.width, streak.height);
          }
        }
        const wave = fluidSurfaceWave(shape, tile, timeSec, appearance);
        if (!wave) continue;
        const shade = fluidDepthShade(own.opacity, appearance, shape.depth + 0.125);
        if (wave.fill.length > 0) fillPolygon(ctx, wave.fill, colorToCss(darkenColor(color, shade.darken), shade.opacity * shape.strength));
        if (appearance.highlight <= 0) continue;
        for (let band = 3; band >= 1; band--) {
          fillPolygon(ctx, bandBelowLine(wave.line, (band * tile) / 32, shape.bodyBottom), colorToCss(highlight, own.opacity * appearance.highlight * 0.1 * shape.strength));
        }
        ctx.beginPath();
        ctx.moveTo(wave.line[0], wave.line[1]);
        for (let i = 2; i < wave.line.length; i += 2) ctx.lineTo(wave.line[i], wave.line[i + 1]);
        ctx.strokeStyle = colorToCss(highlight, own.opacity * Math.min(1, appearance.highlight * 1.2) * shape.strength);
        ctx.lineWidth = Math.max(1, tile / 32);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A live scene running the real fluid simulation with the settings being edited. Changing a physics setting or the
 * scene starts it afresh (new settings cannot be applied to fluid already poured).
 */
export const FluidPreview: React.FC<{ fluid: FluidPreviewSettings }> = ({ fluid }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { density, flowRate } = fluid;
  const [sceneKey, setSceneKey] = useState(DEFAULT_PREVIEW_SCENE);
  const scene = useMemo(() => new PreviewScene({ density, flowRate }, sceneKey), [density, flowRate, sceneKey]);
  const look = useRef({ color: fluid.color, opacity: fluid.opacity, appearance: fluid.appearance });
  look.current = { color: fluid.color, opacity: fluid.opacity, appearance: fluid.appearance };
  const startedAt = useRef(Date.now());
  const [pouring, setPouring] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [stats, setStats] = useState(scene.stats());
  // What is drawn: the scene's levels, resting fluid eased between steps and falling fluid shown at once, as the game does
  const display = useMemo(() => new FluidDisplay(scene.width, scene.height), [scene]);
  const syncDisplay = (now: boolean) => {
    const field = scene.toField();
    for (let y = 0; y < scene.height; y++) {
      for (let x = 0; x < scene.width; x++) {
        const falling = field.getFalling(x, y);
        if (now) display.setNow(x, y, field.getFluidId(x, y), field.getLevel(x, y), falling);
        else display.setTarget(x, y, field.getFluidId(x, y), field.getLevel(x, y), falling);
      }
    }
  };

  useEffect(() => {
    setPouring(scene.pouring);
    setGateOpen(false);
  }, [scene]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPreview(ctx, scene, look.current, TILE_PX, (Date.now() - startedAt.current) / 1000, display);
  };

  useEffect(() => {
    syncDisplay(true);
    setStats(scene.stats());
    draw();
    const stepper = setInterval(() => {
      scene.step();
      syncDisplay(false);
      setStats(scene.stats());
    }, PREVIEW_STEP_MS);
    // Redrawn faster than it steps, so the fluid settles and the waves and streaks move smoothly
    const painter = setInterval(() => {
      display.step(PREVIEW_FRAME_MS / 1000);
      draw();
    }, PREVIEW_FRAME_MS);
    return () => {
      clearInterval(stepper);
      clearInterval(painter);
    };
  }, [scene]);

  // Look changes show straight away, without resetting the scene
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
    setPouring(scene.pouring);
    setGateOpen(false);
    setStats(scene.stats());
    draw();
  };

  const button = 'cursor-pointer px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="fluid-preview bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
      <div>
        <h4 className="font-black text-base tracking-wide text-sky-300">Live Preview</h4>
        <p className="text-xs text-slate-400">The real fluid simulation with the settings on this page. Pick a scene, pour it, open the gate, and see how it settles.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="fluid-preview-scene" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Scene</label>
        <select
          id="fluid-preview-scene"
          value={sceneKey}
          onChange={(e) => setSceneKey(e.target.value)}
          className="cursor-pointer w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm font-bold text-slate-100"
        >
          {PREVIEW_SCENES.map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400">{scene.scene.description}</p>
      </div>
      <canvas
        ref={canvasRef}
        width={scene.width * TILE_PX}
        height={scene.height * TILE_PX}
        aria-label="Fluid preview tank"
        className="w-full rounded-xl border border-slate-700"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={togglePour} disabled={!scene.hasSpout} aria-pressed={pouring} className={`${button} ${pouring ? 'bg-sky-500 hover:bg-sky-400 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}>
          {pouring ? 'Stop Pouring' : 'Pour'}
        </button>
        <button type="button" onClick={openGate} disabled={!scene.hasGate || gateOpen} className={`${button} bg-slate-700 hover:bg-slate-600 text-slate-100`}>
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
