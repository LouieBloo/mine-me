import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DoodadBodyIndex, DoodadReactionSystem, REACTION_MIN_SPEED, bodySpeed, createWander, getAssetUrl, stepWander, wanderOffset, wanderSeed, BLOCK_SCALE,
  type DoodadBody, type DoodadDefinition, type DoodadLightConfig, type ParticleEffectConfig, type WanderState, type WanderSubject,
} from '@mine-me/shared';
import { OriginOffsetCard } from '../../pages/Items/ItemDetail/ItemHoldPreview/OriginOffsetCard/OriginOffsetCard';
import {
  PREVIEW_TILE, anchorPoint, buildPreviewScene, composePreviewFrame, motionLoopSeconds, previewSize,
} from './doodadPreviewScene';
import { MARKER_COLORS, drawDrop, drawDummy, drawLight, drawMarker, drawPiece, drawScene } from './drawDoodadPreview';
import { useParticleOverlay } from './useParticleOverlay';
import './DoodadPreview.css';

/** How near a body must be to scare a bug that has no reaction radius of its own: two original blocks (as in the game). */
const SPOOK_RADIUS = 2 * BLOCK_SCALE;
/** Radius of the dummy body, in cells. */
const DUMMY_RADIUS = 0.9;
/** How fast the sweep test moves the dummy, in cells per second. */
const SWEEP_SPEED = 6;
/** A dragged dummy counts as stopped this long after the pointer last moved. */
const DRAG_IDLE_MS = 90;
const MAX_FRAME_SECONDS = 0.05;

export interface DoodadPreviewChange {
  particleOffsetX?: number;
  particleOffsetY?: number;
  light?: DoodadLightConfig;
}

export interface DoodadPreviewProps {
  /** The doodad as it is being edited (already made safe to draw, see `previewDoodad`). */
  doodad: DoodadDefinition;
  /** The doodad's particle effect, played live from the amber marker. */
  particleConfig?: ParticleEffectConfig | null;
  particleName?: string;
  /** The spore puff effect played when the dummy brushes a reacting doodad. */
  puffConfig?: ParticleEffectConfig | null;
  /** The doodad's ambient sound, for the sound test. */
  ambientSound?: { url: string; volume?: number; loop?: boolean } | null;
  onChange: (fields: DoodadPreviewChange) => void;
}

const toolbarButton = 'cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-lg transition-all';

/**
 * A small scene showing the doodad on fake blocks on the side it is anchored to, with its motion, light, particles and sound
 * playing. It is composed from the same shared layout, motion, reaction and wander code the game uses. Drag the dummy past the
 * doodad to test its wiggle (and scare a bug), and move the light and particle origins with the cards underneath.
 */
const DoodadPreview: React.FC<DoodadPreviewProps> = ({ doodad, particleConfig = null, particleName, puffConfig = null, ambientSound = null, onChange }) => {
  const [playing, setPlaying] = useState(true);
  const [variantIndex, setVariantIndex] = useState(0);
  const [flip, setFlip] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [puffs, setPuffs] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [imageSizes, setImageSizes] = useState<ReadonlyMap<string, { width: number; height: number }>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const timeRef = useRef(0);
  const reactionRef = useRef(new DoodadReactionSystem());
  const wanderRef = useRef<{ key: string; state: WanderState } | null>(null);
  const bodyRef = useRef({ x: 2, y: 2, vx: 0, vy: 0, lastMoveAt: -Infinity, dragging: false, lastPointer: null as { x: number; y: number; t: number } | null });
  const particleAtRef = useRef({ x: 0, y: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sweepRef = useRef(sweeping);
  sweepRef.current = sweeping;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const size = previewSize(doodad, variantIndex);
  const scene = useMemo(() => buildPreviewScene(doodad.anchor, size.width, size.height, flip), [doodad.anchor, size.width, size.height, flip]);
  const widthPx = scene.cols * PREVIEW_TILE;
  const heightPx = scene.rows * PREVIEW_TILE;
  const variantCount = doodad.sizeVariants?.length ?? 0;

  // A variant that no longer exists (it was removed while shown) falls back to the first
  useEffect(() => {
    if (variantIndex > 0 && variantIndex >= variantCount) setVariantIndex(0);
  }, [variantCount, variantIndex]);

  // Every picture the doodad can show, loaded once, so the canvas can draw them
  const urls = useMemo(() => {
    const set = new Set<string>();
    if (size.textureUrl) set.add(size.textureUrl);
    if (doodad.textureUrl) set.add(doodad.textureUrl);
    for (const p of doodad.parts ?? []) if (p.file) set.add(p.file);
    return [...set];
  }, [size.textureUrl, doodad.textureUrl, doodad.parts]);
  useEffect(() => {
    let live = true;
    for (const url of urls) {
      if (imagesRef.current.has(url)) continue;
      const image = new Image();
      image.onload = () => {
        if (!live || image.naturalWidth === 0) return;
        imagesRef.current.set(url, image);
        setImageSizes((prev) => new Map(prev).set(url, { width: image.naturalWidth, height: image.naturalHeight }));
      };
      image.src = getAssetUrl(url);
    }
    return () => {
      live = false;
    };
  }, [urls]);

  const particles = useParticleOverlay({ containerRef: overlayRef, width: widthPx, height: heightPx, config: particleConfig, positionRef: particleAtRef, playing });

  // The frame loop: step the dummy, the wiggle and the bug, then draw
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const draw = (dt: number, now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const body = bodyRef.current;

      if (dt > 0) {
        timeRef.current += dt;
        if (sweepRef.current && !body.dragging) {
          const span = scene.cols - 2;
          const travel = (timeRef.current * SWEEP_SPEED) % (2 * span);
          const x = 1 + (travel < span ? travel : 2 * span - travel);
          body.vx = travel < span ? SWEEP_SPEED : -SWEEP_SPEED;
          body.vy = 0;
          body.x = x;
          body.y = scene.footprint.y + scene.footprint.height - 1;
        } else if (body.dragging && now - body.lastMoveAt > DRAG_IDLE_MS) {
          body.vx = 0;
          body.vy = 0;
        } else if (!body.dragging) {
          body.vx = 0;
          body.vy = 0;
        }
      }

      const f = scene.footprint;
      const base = anchorPoint(scene, doodad.anchor);
      const bodies: DoodadBody[] = [{ id: 'dummy', x: body.x, y: body.y, vx: body.vx, vy: body.vy, radius: DUMMY_RADIUS }];
      const index = new DoodadBodyIndex(bodies);

      let angle = 0;
      if (doodad.reacts) {
        const made = reactionRef.current.update(dt, [{ key: 'preview', x: base.x / PREVIEW_TILE, y: base.y / PREVIEW_TILE, anchor: doodad.anchor, mirror: scene.flip ? -1 : 1, reacts: doodad.reacts }], index);
        angle = reactionRef.current.angleOf('preview');
        if (made.length > 0) {
          setPuffs((n) => n + made.length);
          if (puffConfig) particles.current?.burst(puffConfig, particleAtRef.current);
        }
      } else {
        reactionRef.current.forget('preview');
      }

      let wander: { x: number; y: number; facing: 1 | -1 } | null = null;
      if (doodad.wander) {
        const key = `${doodad.anchor}|${f.x},${f.y},${f.width},${f.height}|${scene.flip}`;
        if (wanderRef.current?.key !== key) wanderRef.current = { key, state: createWander(wanderSeed(f.x, f.y)) };
        const state = wanderRef.current.state;
        const subject: WanderSubject = { anchor: doodad.anchor, x: f.x, y: f.y, width: f.width, height: f.height, flip: scene.flip };
        const x = base.x / PREVIEW_TILE + wanderOffset(state).x;
        const y = base.y / PREVIEW_TILE + wanderOffset(state).y;
        const radius = doodad.reacts?.radius ?? SPOOK_RADIUS;
        let spook: { x: number; y: number } | null = null;
        for (const b of index.near(x, y, radius)) {
          const distance = Math.hypot(b.x - x, b.y - y);
          if (bodySpeed(b) >= REACTION_MIN_SPEED || distance <= radius * 0.5) spook = { x: b.x, y: b.y };
        }
        stepWander(state, doodad.wander, subject, scene, dt, spook);
        const off = wanderOffset(state);
        wander = { x: off.x, y: off.y, facing: state.facing };
      } else {
        wanderRef.current = null;
      }

      const frame = composePreviewFrame({ doodad, scene, variantIndex, timeSeconds: timeRef.current, reactionAngle: angle, wander, imageSizes });
      particleAtRef.current = frame.particlesAt;

      if (!ctx) return;
      drawScene(ctx, scene);
      for (const piece of frame.pieces) drawPiece(ctx, piece, piece.url ? imagesRef.current.get(piece.url) ?? null : null, doodad.anchor, doodad.key);
      if (frame.drop) drawDrop(ctx, frame.drop);
      if (frame.light) drawLight(ctx, frame.light, frame.lightAt);
      if (showMarkers) {
        drawMarker(ctx, frame.anchor, MARKER_COLORS.anchor, 'cross');
        if (doodad.particleEffectId) drawMarker(ctx, frame.particlesAt, MARKER_COLORS.particle);
        if (doodad.light) drawMarker(ctx, frame.lightAt, MARKER_COLORS.light);
        if (doodad.parts) for (const piece of frame.pieces) drawMarker(ctx, { x: piece.x, y: piece.y }, MARKER_COLORS.pivot, 'cross');
      }
      if (doodad.reacts || doodad.wander) drawDummy(ctx, { x: body.x * PREVIEW_TILE, y: body.y * PREVIEW_TILE }, DUMMY_RADIUS * PREVIEW_TILE, Math.hypot(body.vx, body.vy) >= REACTION_MIN_SPEED);
    };

    const tick = (ts: number) => {
      const dt = last === null || !playingRef.current ? 0 : Math.min(MAX_FRAME_SECONDS, (ts - last) / 1000);
      last = ts;
      draw(dt, ts);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doodad, scene, variantIndex, imageSizes, showMarkers, puffConfig, particles]);

  // The sound test
  useEffect(() => {
    if (!soundOn || !ambientSound) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    const audio = new Audio(getAssetUrl(ambientSound.url));
    audio.volume = Math.min(1, Math.max(0, ambientSound.volume ?? 1));
    audio.loop = ambientSound.loop ?? false;
    audio.onended = () => setSoundOn(false);
    audio.play().catch(() => setSoundOn(false));
    audioRef.current = audio;
    return () => {
      audio.pause();
    };
  }, [soundOn, ambientSound?.url, ambientSound?.volume, ambientSound?.loop]);

  const pointerCell = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * scene.cols, y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * scene.rows };
  }, [scene.cols, scene.rows]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const at = pointerCell(e);
    const b = bodyRef.current;
    b.dragging = true;
    b.x = at.x;
    b.y = at.y;
    b.vx = 0;
    b.vy = 0;
    b.lastPointer = { ...at, t: e.timeStamp };
    setSweeping(false);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = bodyRef.current;
    if (!b.dragging) return;
    const at = pointerCell(e);
    const prev = b.lastPointer;
    if (prev) {
      const seconds = Math.max(0.001, (e.timeStamp - prev.t) / 1000);
      // Smoothed, so a jittery pointer does not flicker the body between moving and still
      b.vx = b.vx * 0.5 + ((at.x - prev.x) / seconds) * 0.5;
      b.vy = b.vy * 0.5 + ((at.y - prev.y) / seconds) * 0.5;
    }
    b.x = at.x;
    b.y = at.y;
    b.lastPointer = { ...at, t: e.timeStamp };
    b.lastMoveAt = performance.now();
  };
  const onPointerUp = () => {
    const b = bodyRef.current;
    b.dragging = false;
    b.vx = 0;
    b.vy = 0;
    b.lastPointer = null;
  };

  const loopSeconds = motionLoopSeconds(doodad);
  const light = doodad.light;
  const lightOffset = { x: light?.offsetX ?? 0, y: light?.offsetY ?? 0 };

  return (
    <div className="doodad-preview bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" data-testid="doodad-preview">
      <div className="bg-slate-800 p-4">
        <h3 className="text-lg font-black text-white tracking-tight uppercase">Preview</h3>
        <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">{doodad.anchor.toLowerCase()} doodad, motion, light and sound</p>
      </div>

      <div className="p-4 space-y-4">
        <div
          className="relative w-full select-none touch-none cursor-grab active:cursor-grabbing rounded-xl overflow-hidden border border-slate-300"
          style={{ aspectRatio: `${scene.cols} / ${scene.rows}` }}
          data-testid="doodad-preview-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} width={widthPx} height={heightPx} className="absolute inset-0 w-full h-full" aria-label="Doodad preview scene" />
          <div ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none [&>canvas]:w-full [&>canvas]:h-full" data-testid="doodad-preview-particles" />
        </div>
        <p className="text-[11px] text-slate-400 font-medium">
          {doodad.reacts || doodad.wander ? 'Press and drag on the scene to move the grey dummy past the doodad: it wiggles and bugs run from it.' : 'Turn on "Reacts to bodies" or "Wanders" to test the dummy.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPlaying((p) => !p)} className={toolbarButton}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" aria-pressed={sweeping} onClick={() => setSweeping((s) => !s)} className={`${toolbarButton} ${sweeping ? 'bg-slate-900 text-white hover:bg-slate-700' : ''}`}>
            {sweeping ? 'Stop sweep' : 'Sweep dummy past'}
          </button>
          <button type="button" aria-pressed={showMarkers} onClick={() => setShowMarkers((s) => !s)} className={toolbarButton}>{showMarkers ? 'Hide markers' : 'Show markers'}</button>
          {doodad.anchor === 'WALL' && (
            <button type="button" aria-pressed={flip} onClick={() => setFlip((f) => !f)} className={toolbarButton}>{flip ? 'Wall on the right' : 'Wall on the left'}</button>
          )}
          {ambientSound && (
            <button type="button" aria-pressed={soundOn} onClick={() => setSoundOn((s) => !s)} className={toolbarButton}>{soundOn ? 'Stop sound' : 'Play ambient sound'}</button>
          )}
        </div>

        {variantCount > 1 && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Size shown
            <select aria-label="Size shown" value={variantIndex} onChange={(e) => setVariantIndex(Number(e.target.value))} className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold cursor-pointer">
              {doodad.sizeVariants!.map((v, i) => (
                <option key={i} value={i}>{`Size ${i + 1}: ${v.width} x ${v.height}`}</option>
              ))}
            </select>
          </label>
        )}

        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-50 rounded-lg p-2"><dt className="font-black uppercase text-slate-500 tracking-wider">Loop</dt><dd className="font-bold text-slate-800" data-testid="preview-loop">{loopSeconds > 0 ? `${loopSeconds.toFixed(1)} s` : 'still'}</dd></div>
          <div className="bg-slate-50 rounded-lg p-2"><dt className="font-black uppercase text-slate-500 tracking-wider">Size</dt><dd className="font-bold text-slate-800">{size.width} x {size.height}</dd></div>
          <div className="bg-slate-50 rounded-lg p-2"><dt className="font-black uppercase text-slate-500 tracking-wider">Puffs</dt><dd className="font-bold text-slate-800" data-testid="preview-puffs">{puffs}</dd></div>
        </dl>

        <p className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
          <span><span style={{ color: MARKER_COLORS.anchor }} className="bg-slate-700 px-1 rounded">+</span> anchor point</span>
          {doodad.particleEffectId && <span><span style={{ color: MARKER_COLORS.particle }}>◯</span> particles{particleName ? ` (${particleName})` : ''}</span>}
          {light && <span><span style={{ color: MARKER_COLORS.light }}>◯</span> light</span>}
          {doodad.parts && doodad.parts.length > 0 && <span><span style={{ color: MARKER_COLORS.pivot }}>+</span> part pivots</span>}
        </p>

        {doodad.particleEffectId && (
          <OriginOffsetCard
            testId="doodad-particle-origin"
            name="Particle"
            title="Particle Origin"
            description={`Where ${particleName ? `"${particleName}"` : 'the effect'} plays, from the anchor point, in the game's pixels (amber marker).`}
            theme="amber"
            x={doodad.particleOffsetX ?? 0}
            y={doodad.particleOffsetY ?? 0}
            onChange={(o) => onChange({ ...(o.x !== undefined ? { particleOffsetX: o.x } : {}), ...(o.y !== undefined ? { particleOffsetY: o.y } : {}) })}
            onReset={() => onChange({ particleOffsetX: 0, particleOffsetY: 0 })}
          />
        )}
        {light && (
          <OriginOffsetCard
            testId="doodad-light-origin"
            name="Light"
            title="Light Origin"
            description="Where the light sits, from the anchor point, in the game's pixels (blue marker)."
            theme="sky"
            x={lightOffset.x}
            y={lightOffset.y}
            onChange={(o) => onChange({ light: { ...light, offsetX: o.x ?? lightOffset.x, offsetY: o.y ?? lightOffset.y } })}
            onReset={() => onChange({ light: { ...light, offsetX: 0, offsetY: 0 } })}
          />
        )}
      </div>
    </div>
  );
};

export default DoodadPreview;
