import {
  DOODAD_MOTION_PRESETS, MINING_TILE_PIXELS, doodadBasePoint, doodadCycle, doodadLightConfig, doodadPhase, doodadSizeChoices, evaluateDoodadMotion, layoutDoodad, layoutDoodadParts,
  type DoodadAnchor, type DoodadDefinition, type DoodadFootprint, type DoodadLayout, type DoodadLightConfig, type DoodadPartLayout, type DoodadPose, type WanderTerrain,
} from '@mine-me/shared';

/**
 * The pure half of the doodad preview: the little scene a doodad is shown in (fake blocks on the side it is anchored to),
 * and where every piece of it is drawn at a moment. The picture is composed from the same shared layout, motion, reaction
 * and wander code the game uses, so what is tuned in the admin is what the game shows. Nothing here touches a canvas.
 */

/** Size of one cell in the preview, in pixels. */
export const PREVIEW_TILE = 32;
/** How much bigger a cell is here than in the game, for offsets that are in the game's pixels (the light and particle offsets). */
export const PREVIEW_PIXEL_SCALE = PREVIEW_TILE / MINING_TILE_PIXELS;
/** Rows or columns of fake block on the anchored side. */
export const PREVIEW_WALL_THICKNESS = 3;

export interface PreviewScene extends WanderTerrain {
  cols: number;
  rows: number;
  /** Where the doodad stands, in cells. */
  footprint: DoodadFootprint;
  /** A WALL doodad whose wall is on the right. */
  flip: boolean;
  anchor: DoodadAnchor;
  isSolid(x: number, y: number): boolean;
}

/**
 * A scene for a doodad of `width` x `height` cells: a floor under a FLOOR doodad, a ceiling over a CEILING one, a wall beside a
 * WALL one (left, or right when `flip`), and open air around an AIR one. Out-of-scene cells count as solid, like the game's
 * unrevealed cells, so a bug cannot wander off the edge.
 */
export function buildPreviewScene(anchor: DoodadAnchor, width: number, height: number, flip = false): PreviewScene {
  const t = PREVIEW_WALL_THICKNESS;
  const cols = Math.max(16, width + 2 * t + 6);
  const rows = Math.max(12, height + 2 * t + 4);
  const centreX = Math.floor((cols - width) / 2);
  let footprint: DoodadFootprint;
  let solid: (x: number, y: number) => boolean;
  switch (anchor) {
    case 'FLOOR':
      footprint = { x: centreX, y: rows - t - height, width, height };
      solid = (_x, y) => y >= rows - t;
      break;
    case 'CEILING':
      footprint = { x: centreX, y: t, width, height };
      solid = (_x, y) => y < t;
      break;
    case 'WALL':
      footprint = flip ? { x: cols - t - width, y: Math.floor((rows - t - height) / 2), width, height } : { x: t, y: Math.floor((rows - t - height) / 2), width, height };
      solid = (x, y) => (flip ? x >= cols - t : x < t) || y >= rows - 1;
      break;
    case 'AIR':
      footprint = { x: centreX, y: Math.floor((rows - height) / 2), width, height };
      solid = () => false;
      break;
  }
  const isSolid = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows || solid(x, y);
  return { cols, rows, footprint, flip: anchor === 'WALL' && flip, anchor, isSolid };
}

/** The size the doodad is shown at: one of its size choices, or its own footprint. */
export function previewSize(doodad: Pick<DoodadDefinition, 'width' | 'height' | 'sizeVariants'>, variantIndex: number): { width: number; height: number; textureUrl: string | null } {
  const choices = doodadSizeChoices(doodad);
  const choice = choices[Math.min(Math.max(0, Math.floor(variantIndex) || 0), choices.length - 1)];
  return { width: choice.width, height: choice.height, textureUrl: choice.textureUrl ?? null };
}

/** The colour of the placeholder drawn while a doodad has no picture, from its key (stable, so it is the one the game shows too). */
export function placeholderColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 55%)`;
}

/** One picture to draw, with its pivot in preview pixels. */
export interface PreviewPiece {
  /** Part name, or null for the doodad's main picture. */
  name: string | null;
  /** The picture's url, or null for the placeholder shape. */
  url: string | null;
  /** Where the picture turns, in pixels of the scene, with motion already added. */
  x: number;
  y: number;
  /** The pivot as a fraction of the picture. */
  pivotX: number;
  pivotY: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  zIndex: number;
}

export interface PreviewFrame {
  pieces: PreviewPiece[];
  layout: DoodadLayout;
  /** The doodad's base point in the scene, in pixels, with a bug's wander added. */
  anchor: { x: number; y: number };
  /** Where the light and the particles are, in pixels of the scene. */
  lightAt: { x: number; y: number };
  particlesAt: { x: number; y: number };
  /** The light as it is drawn at this moment (null when it has none): radius in pixels and a 0..1 strength. */
  light: { color: string; radius: number; strength: number } | null;
  /** `drip` only: the falling drop's place in pixels and how faded it is, or null while none falls. */
  drop: { x: number; y: number; alpha: number } | null;
  /** A bug's facing, 1 or -1. */
  facing: 1 | -1;
}

export interface PreviewInput {
  doodad: DoodadDefinition;
  scene: PreviewScene;
  variantIndex: number;
  timeSeconds: number;
  /** The spring lean of the reaction, in radians. */
  reactionAngle: number;
  /** A bug's offset from its spot in cells. */
  wander: { x: number; y: number; facing: 1 | -1 } | null;
  /** The size of a picture once loaded, by url. Pictures not in here are drawn as the placeholder. */
  imageSizes: ReadonlyMap<string, { width: number; height: number }>;
}

/** The cycle's phase for the preview doodad: its own if the motion gives one, else from its spot. */
export const previewPhase = (scene: PreviewScene): number => doodadPhase(scene.footprint.x, scene.footprint.y);

/** How strong the light is at a moment, 0 to 1, from the light's effect (the same formulas as the game's: a steady light, a pulse or a flicker). */
export function previewLightStrength(light: { effect: string; intensity: number; minIntensity?: number; maxIntensity?: number; pulseSpeed?: number; flickerSpeed?: number; flickerAmount?: number }, timeSeconds: number): number {
  const base = Math.max(0, Math.min(1, light.intensity));
  if (light.effect === 'PULSE') {
    const lo = light.minIntensity ?? base * 0.6;
    const hi = light.maxIntensity ?? base * 1.2;
    const wave = 0.5 + 0.5 * Math.sin(timeSeconds * (light.pulseSpeed ?? 2.5));
    return Math.max(0, Math.min(1, lo + (hi - lo) * wave));
  }
  if (light.effect === 'FLICKER') {
    const speed = light.flickerSpeed ?? 12;
    const amount = light.flickerAmount ?? 0.2;
    const noise = 0.5 * Math.sin(timeSeconds * speed) + 0.3 * Math.sin(timeSeconds * speed * 2.31 + 1.7) + 0.2 * Math.sin(timeSeconds * speed * 5.13 + 0.4);
    return Math.max(0, Math.min(1, base * (1 + amount * noise)));
  }
  return base;
}

const DROP_HEIGHT_FALLBACK = 1;

/** Where everything is at `timeSeconds`: the doodad's pieces posed by its motion, the reaction lean and a bug's wander. */
export function composePreviewFrame(input: PreviewInput): PreviewFrame {
  const { doodad, scene, timeSeconds, reactionAngle, wander, imageSizes } = input;
  const size = previewSize(doodad, input.variantIndex);
  const footprint: DoodadFootprint = { ...scene.footprint, width: size.width, height: size.height };
  const motion = doodad.motion ?? null;
  const phase = previewPhase(scene);
  const pieces: PreviewPiece[] = [];
  let layout: DoodadLayout;

  const url = size.textureUrl ?? doodad.textureUrl ?? null;
  if (doodad.parts && doodad.parts.length > 0) {
    const placed = layoutDoodadParts(doodad.anchor, footprint, doodad.parts, scene.flip, PREVIEW_TILE);
    layout = placed.layout;
    const zByName = new Map(doodad.parts.map((p) => [p.name, p.z_index]));
    for (const part of placed.parts as DoodadPartLayout[]) {
      const pose = evaluateDoodadMotion(motion, timeSeconds, phase, part.name);
      const def = doodad.parts.find((p) => p.name === part.name)!;
      pieces.push({
        name: part.name,
        url: imageSizes.has(def.file) ? def.file : null,
        x: part.x + pose.x * layout.drawWidth * layout.mirror,
        y: part.y + pose.y * layout.drawHeight,
        pivotX: part.pivotX,
        pivotY: part.pivotY,
        width: part.width,
        height: part.height,
        rotation: pose.rotation * layout.mirror + (reactionAngle || 0),
        scaleX: pose.scaleX * layout.mirror,
        scaleY: pose.scaleY,
        alpha: pose.alpha,
        zIndex: zByName.get(part.name) ?? 0,
      });
    }
  } else {
    const natural = url ? imageSizes.get(url) : undefined;
    // Without a picture the placeholder fills the footprint, which is also the box the game draws it in
    const image = natural ?? { width: footprint.width * PREVIEW_TILE, height: footprint.height * PREVIEW_TILE };
    layout = layoutDoodad(doodad.anchor, footprint, image, scene.flip, PREVIEW_TILE);
    const pose: DoodadPose = evaluateDoodadMotion(motion, timeSeconds, phase);
    pieces.push({
      name: null,
      url: natural ? url : null,
      x: layout.anchorX + pose.x * layout.drawWidth * layout.mirror,
      y: layout.anchorY + pose.y * layout.drawHeight,
      pivotX: layout.originX,
      pivotY: layout.originY,
      width: layout.drawWidth,
      height: layout.drawHeight,
      rotation: pose.rotation * layout.mirror + (reactionAngle || 0),
      scaleX: pose.scaleX * layout.mirror,
      scaleY: pose.scaleY,
      alpha: pose.alpha,
      zIndex: 0,
    });
  }
  pieces.sort((a, b) => a.zIndex - b.zIndex);

  // A bug is carried to where it has walked; facing the way it goes (a wall bug climbs, so it keeps its side)
  const walkedX = (wander?.x ?? 0) * PREVIEW_TILE;
  const walkedY = (wander?.y ?? 0) * PREVIEW_TILE;
  const facing: 1 | -1 = wander?.facing ?? 1;
  for (const piece of pieces) {
    piece.x += walkedX;
    piece.y += walkedY;
    if (wander && doodad.anchor !== 'WALL') piece.scaleX = Math.abs(piece.scaleX) * facing * layout.mirror;
  }
  const anchor = { x: layout.anchorX + walkedX, y: layout.anchorY + walkedY };
  const at = (offsetX?: number, offsetY?: number) => ({
    x: anchor.x + (offsetX ?? 0) * PREVIEW_PIXEL_SCALE * layout.mirror,
    y: anchor.y + (offsetY ?? 0) * PREVIEW_PIXEL_SCALE,
  });

  const lightConfig = doodadLightConfig<DoodadLightConfig>(doodad.light, motion);
  const light = lightConfig
    ? { color: lightConfig.color, radius: lightConfig.radius * PREVIEW_TILE, strength: previewLightStrength(lightConfig, timeSeconds) }
    : null;

  let drop: PreviewFrame['drop'] = null;
  if (motion?.preset === 'drip' && !doodad.parts?.some((p) => p.name === 'drop')) {
    const pose = evaluateDoodadMotion(motion, timeSeconds, phase);
    if (pose.drop >= 0) {
      const h = (footprint.height || DROP_HEIGHT_FALLBACK) * PREVIEW_TILE;
      const startY = doodad.anchor === 'CEILING' ? h * 0.9 : 0;
      drop = { x: anchor.x, y: anchor.y + startY + pose.drop * h, alpha: 1 - pose.drop * pose.drop };
    }
  }

  return { pieces, layout, anchor, lightAt: at(doodad.light?.offsetX, doodad.light?.offsetY), particlesAt: at(doodad.particleOffsetX, doodad.particleOffsetY), light, drop, facing };
}

/** Whether a motion preset exists in the registry (a stored preset the registry has lost is shown as standing still). */
export const hasMotion = (doodad: Pick<DoodadDefinition, 'motion'>): boolean => Boolean(doodad.motion && DOODAD_MOTION_PRESETS[doodad.motion.preset]);

/** The cycle length of the doodad's motion in seconds, for the "one loop" readout. 0 when it stands still. */
export function motionLoopSeconds(doodad: Pick<DoodadDefinition, 'motion'>): number {
  if (!doodad.motion || !hasMotion(doodad)) return 0;
  // doodadCycle is cycles since the start: how long one whole cycle takes follows from two samples
  const a = doodadCycle(doodad.motion, 0, 0);
  const b = doodadCycle(doodad.motion, 1, 0);
  return b > a ? 1 / (b - a) : 0;
}

/** The base point of a footprint in preview pixels for a footprint-relative fraction, for the origin marker. */
export function anchorPoint(scene: PreviewScene, anchor: DoodadAnchor): { x: number; y: number } {
  const base = doodadBasePoint(anchor);
  const f = scene.footprint;
  return { x: (f.x + (scene.flip ? 1 : base.x) * f.width) * PREVIEW_TILE, y: (f.y + base.y * f.height) * PREVIEW_TILE };
}
