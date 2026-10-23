import { useEffect, useRef, useState } from 'react';
import { PREVIEW_BELT_ROWS, previewCycleSeconds, previewFrame, type ExtractorPreviewSettings } from './previewScene';
import './ExtractorPreview.css';

const TILE_PX = 10;
/** How high above the ground the machine starts, in cells. */
const START_HEIGHT = 14;
const SKY_CELLS = 24;
const GROUND_CELLS = PREVIEW_BELT_ROWS + 3;

type DrawContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle' | 'beginPath' | 'arc' | 'fill'>;

/** Draws one frame of the preview: sky, ground with the shaft dug so far, the machine, and the items on the belt. */
export function drawExtractorPreview(ctx: DrawContext, settings: ExtractorPreviewSettings, timeSeconds: number, tile: number = TILE_PX): void {
  const frame = previewFrame(timeSeconds, settings);
  const width = Math.max(settings.width + 6, 20);
  const groundY = SKY_CELLS * tile;
  ctx.clearRect(0, 0, width * tile, (SKY_CELLS + GROUND_CELLS) * tile);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0, 0, width * tile, groundY);
  ctx.fillStyle = '#5b4636';
  ctx.fillRect(0, groundY, width * tile, GROUND_CELLS * tile);

  const machineX = ((width - settings.width) / 2) * tile;
  const shaftX = machineX + ((settings.width - settings.shaftWidth) / 2) * tile;
  const shaftPx = settings.shaftWidth * tile;

  // The dug shaft and its belt segments
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(shaftX, groundY, shaftPx, frame.beltRows * tile);
  ctx.fillStyle = '#6b7280';
  for (let row = 0; row < frame.beltRows; row++) ctx.fillRect(shaftX + 2, groundY + row * tile + tile / 2, shaftPx - 4, 2);

  // The machine, coming down from above
  const heightPx = Math.min(settings.height, SKY_CELLS - 1) * tile;
  const top = groundY - heightPx - frame.heightFraction * START_HEIGHT * tile;
  ctx.fillStyle = '#475569';
  ctx.fillRect(machineX, top, settings.width * tile, heightPx);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(machineX, top, settings.width * tile, Math.max(2, tile * 0.5));

  // Items riding up
  ctx.fillStyle = '#fbbf24';
  for (const pos of frame.items) {
    ctx.beginPath();
    ctx.arc(shaftX + shaftPx / 2, groundY + pos * tile, tile * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface ExtractorPreviewProps {
  settings: ExtractorPreviewSettings;
}

/** Plays the extractor's landing and a short belt with items travelling, so the rates can be judged (like the fluid and gas previews). */
export default function ExtractorPreview({ settings }: ExtractorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runKey, setRunKey] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    let frameId = 0;
    const started = performance.now();
    const loop = () => {
      drawExtractorPreview(ctx, settingsRef.current, (performance.now() - started) / 1000);
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [runKey]);

  const width = Math.max(settings.width + 6, 20);
  const cycle = previewCycleSeconds(settings);

  return (
    <section className="extractor-preview bg-white border border-slate-200 rounded-2xl p-6 space-y-3" data-testid="extractor-preview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Preview</h4>
          <p className="text-xs text-slate-500 font-medium">
            Landing, then the belt digging and a player unloading onto it. Changes show straight away (unsaved too). Repeats every {cycle.toFixed(0)}s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRunKey((k) => k + 1)}
          className="cursor-pointer px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition-all shrink-0"
        >
          Restart
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width * TILE_PX}
        height={(SKY_CELLS + GROUND_CELLS) * TILE_PX}
        className="w-full rounded-lg border border-slate-200 bg-slate-100"
        style={{ imageRendering: 'pixelated' }}
        aria-label="Extractor preview"
      />
    </section>
  );
}

export type { ExtractorPreviewSettings };
