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
