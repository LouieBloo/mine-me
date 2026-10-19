export interface SkeletonPartDef {
  file: string;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  pivot_anchor: [number, number];
  offset_from_pelvis: [number, number];
  z_index: number;
  slot: string;
}

/** How far below the pelvis (rig pixels) the miner rig's feet are; what the placement code assumed for every rig. */
export const DEFAULT_RIG_FOOT_DEPTH = 426;

/**
 * How far below the pelvis (in rig pixels) a rig's feet reach: the lowest end of its legs, from where each leg hangs
 * (its offset from the pelvis) and how far the leg sprite extends below its pivot. Rigs differ (the mole's legs are
 * shorter than the miner's), so a sprite is planted on the ground with its own depth, not a shared constant.
 */
export function rigFootDepth(manifest: { parts?: Record<string, Partial<SkeletonPartDef>> } | null | undefined): number {
  let deepest = -Infinity;
  for (const [name, part] of Object.entries(manifest?.parts ?? {})) {
    if (!name.startsWith('leg')) continue;
    const height = part.height ?? part.bbox?.[3];
    if (!height || height <= 0) continue;
    const depth = (part.offset_from_pelvis?.[1] ?? 0) + height * (1 - (part.pivot_anchor?.[1] ?? 0));
    deepest = Math.max(deepest, depth);
  }
  return Number.isFinite(deepest) ? deepest : DEFAULT_RIG_FOOT_DEPTH;
}

export interface SkeletonHandJointDef {
  offset: [number, number];
}

export interface SkeletonToolSocketDef {
  offset: [number, number];
  scale?: number;
  rotation?: number;
}

export interface SkeletonManifest {
  version: string;
  canvas_size: [number, number];
  pelvis_origin: [number, number];
  hand_joint?: SkeletonHandJointDef;
  tool_socket?: SkeletonToolSocketDef;
  miningStyle?: 'tool' | 'hands';
  parts: Record<string, SkeletonPartDef>;
}


export type ModularAnimationState = 'idle' | 'walk' | 'mine' | 'attack' | 'damage' | 'death';

export interface PartOverride {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pivotX: number;
  pivotY: number;
}

export type PartOverridesMap = Record<string, PartOverride>;

export interface HandJointOverride {
  offsetX: number;
  offsetY: number;
}

export interface ToolSocketOverride {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export type ModularRigTarget =
  | { type: 'character' }
  | { type: 'mob'; mobId: string; mobName?: string };
