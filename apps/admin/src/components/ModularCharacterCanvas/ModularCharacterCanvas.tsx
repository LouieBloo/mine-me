import type { GearSubType } from '@mine-me/shared';
import type { CharacterAnimationState } from './animation/ModularAnimationEngine';
import { useModularCanvasScene, type SkeletonManifest, type SkeletonPartDef } from './hooks/useModularCanvasScene';
import { useModularGear } from './hooks/useModularGear';
import './ModularCharacterCanvas.css';

export type { SkeletonManifest, SkeletonPartDef, CharacterAnimationState };

export interface ModularCharacterCanvasProps {
  manifestUrl?: string;
  animationState?: CharacterAnimationState;
  speedMultiplier?: number;
  isPlaying?: boolean;
  isFlipped?: boolean;
  scale?: number;
  showDebugJoints?: boolean;
  showDebugBones?: boolean;
  showDebugBbox?: boolean;
  hiddenParts?: string[];
  highlightedPart?: string | null;
  selectedGear?: Array<{ url: string; subType: GearSubType }>;
  partOverrides?: Record<
    string,
    {
      width?: number;
      height?: number;
      offsetX?: number;
      offsetY?: number;
      pivotX?: number;
      pivotY?: number;
    }
  >;
  rootOffsetY?: number;
  width?: number;
  height?: number;
  className?: string;
}

export default function ModularCharacterCanvas({
  manifestUrl,
  animationState = 'idle',
  speedMultiplier = 1.0,
  isPlaying = true,
  isFlipped = false,
  scale = 1.0,
  showDebugJoints = false,
  showDebugBones = false,
  showDebugBbox = false,
  hiddenParts = [],
  highlightedPart = null,
  selectedGear = [],
  partOverrides = {},
  rootOffsetY = 0,
  width = 460,
  height = 520,
  className = '',
}: ModularCharacterCanvasProps) {
  const { containerRef, nodesRef, loading, error } = useModularCanvasScene({
    manifestUrl,
    animationState,
    speedMultiplier,
    isPlaying,
    isFlipped,
    scale,
    showDebugJoints,
    showDebugBones,
    showDebugBbox,
    hiddenParts,
    highlightedPart,
    partOverrides,
    rootOffsetY,
    width,
    height,
  });

  useModularGear({
    nodesRef,
    selectedGear,
  });

  return (
    <div
      ref={containerRef}
      className={`modular-character-canvas-wrapper relative ${className}`}
      style={{ width, height }}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-20">
          <div className="w-10 h-10 border-4 border-solid border-t-transparent rounded-full animate-spin mb-3"></div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Loading Skeleton Rig...
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 m-4 text-center text-red-400 font-bold text-sm bg-red-950/60 rounded-xl border border-red-900/60 z-20">
          {error}
        </div>
      )}
    </div>
  );
}
