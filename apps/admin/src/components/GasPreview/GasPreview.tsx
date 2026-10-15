import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GAS_APPEARANCE, GAS_BLOB_LAYERS, GAS_VISIBLE_MIN, MINING_CONFIG, colorToCss, gasBlobCentre, gasBlobRadius, gasCellAlpha, parseHexColor,
  type GasAppearance,
} from '@mine-me/shared';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PreviewScene, VENT } from './previewScene';
import './GasPreview.css';

const TILE_PX = 28;
/** How often the game steps its gas, in seconds and in ms. */
export const PREVIEW_STEP_SECONDS = MINING_CONFIG.GAS_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE;
export const PREVIEW_STEP_MS = Math.round(PREVIEW_STEP_SECONDS * 1000);

/** How often the picture is redrawn so the drift moves smoothly, in ms (the simulation steps more slowly than this). */
export const PREVIEW_FRAME_MS = 50;

export interface GasPreviewSettings {
  color: string;
  opacity: number;
  /** Softness and drift. Absent: the defaults. */
  appearance?: GasAppearance;
  density: number;
  diffusionRate: number;
  minConcentration: number;
  ventLifetime: number;
}

type DrawContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'fillRect' | 'fillStyle' | 'globalAlpha' | 'beginPath' | 'arc' | 'fill'
>;

/**
 * Draws the box: terrain, then each gas cell through the same soft blobs the game uses (same radius, layers,
 * opacity and drift), so what is tuned here is what the game shows.
 */
export function drawPreview(
  ctx: DrawContext,
  scene: PreviewScene,
  look: Pick<GasPreviewSettings, 'color' | 'opacity' | 'appearance'>,
  tile: number = TILE_PX,
  timeSec = 0
): void {
  const appearance = look.appearance ?? DEFAULT_GAS_APPEARANCE;
  const color = parseHexColor(look.color);
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
  for (let y = 0; y < PREVIEW_HEIGHT; y++) {
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      const concentration = scene.concentrationAt(x, y);
      if (concentration < GAS_VISIBLE_MIN) continue;
      const alpha = gasCellAlpha(look.opacity, concentration);
      if (appearance.softness <= 0.01) {
        ctx.fillStyle = colorToCss(color, alpha);
        ctx.fillRect(x * tile, y * tile, tile, tile);
        continue;
      }
      const centre = gasBlobCentre(x, y, timeSec, appearance.driftSpeed, appearance.driftAmount);
      const radius = gasBlobRadius(appearance.softness) * tile;
      for (const layer of GAS_BLOB_LAYERS) {
        ctx.beginPath();
        ctx.arc(centre.x * tile, centre.y * tile, radius * layer.radius, 0, Math.PI * 2);
        ctx.fillStyle = colorToCss(color, alpha * layer.alpha);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A live box running the real gas simulation with the settings being edited. Changing a physics setting
 * starts a fresh box (the new settings cannot be applied to gas already released).
 */
export const GasPreview: React.FC<{ gas: GasPreviewSettings }> = ({ gas }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { density, diffusionRate, minConcentration, ventLifetime } = gas;
  const scene = useMemo(
    () => new PreviewScene({ density, diffusionRate, minConcentration, ventLifetime }, PREVIEW_STEP_SECONDS),
    [density, diffusionRate, minConcentration, ventLifetime]
  );
  const look = useRef({ color: gas.color, opacity: gas.opacity, appearance: gas.appearance });
  look.current = { color: gas.color, opacity: gas.opacity, appearance: gas.appearance };
  const startedAt = useRef(Date.now());
  const [releasing, setReleasing] = useState(false);
  const [ventOpen, setVentOpen] = useState(false);
  const [stats, setStats] = useState(scene.stats());

  useEffect(() => {
    setReleasing(false);
    setVentOpen(false);
  }, [scene]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPreview(ctx, scene, look.current, TILE_PX, (Date.now() - startedAt.current) / 1000);
  };

  useEffect(() => {
    draw();
    const stepper = setInterval(() => {
      scene.step();
      setStats(scene.stats());
    }, PREVIEW_STEP_MS);
    // Redrawn faster than it steps, so the drift moves smoothly
    const painter = setInterval(draw, PREVIEW_FRAME_MS);
    return () => {
      clearInterval(stepper);
      clearInterval(painter);
    };
  }, [scene]);

  // Look changes show straight away, without resetting the box
  useEffect(draw, [gas.color, gas.opacity, gas.appearance]);

  const toggleRelease = () => {
    scene.setReleasing(!releasing);
    setReleasing(!releasing);
  };
  const openVent = () => {
    scene.openVent();
    setVentOpen(true);
  };
  const reset = () => {
    scene.reset();
    setReleasing(false);
    setVentOpen(false);
    setStats(scene.stats());
    draw();
  };

  const button = 'cursor-pointer px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="gas-preview bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
      <div>
        <h4 className="font-black text-base tracking-wide text-sky-300">Live Preview</h4>
        <p className="text-xs text-slate-400">
          The real gas simulation with the settings on this page. Release it, open the roof gate (column {VENT.x}), and see where it goes.
        </p>
      </div>
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH * TILE_PX}
        height={PREVIEW_HEIGHT * TILE_PX}
        aria-label="Gas preview box"
        className="w-full rounded-xl border border-slate-700"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggleRelease} aria-pressed={releasing} className={`${button} ${releasing ? 'bg-sky-500 hover:bg-sky-400 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}>
          {releasing ? 'Stop Releasing' : 'Release'}
        </button>
        <button type="button" onClick={openVent} disabled={ventOpen} className={`${button} bg-slate-700 hover:bg-slate-600 text-slate-100`}>
          Open Roof Gate
        </button>
        <button type="button" onClick={reset} className={`${button} bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600`}>
          Reset
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['In box', stats.volume.toFixed(2)],
          ['Escaped', stats.vented.toFixed(2)],
          ['Moving cells', String(stats.activeCells)],
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

export default GasPreview;
