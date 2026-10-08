import React, { useState, useMemo } from 'react';
import { getAssetUrl } from '@mine-me/shared';
import ModularCharacterCanvas from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import type { CharacterAnimationState } from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import './ItemHoldPreview.css';

export interface ItemHoldPreviewProps {
  item: {
    id?: string;
    name?: string;
    type?: string;
    subType?: string;
    gearImageUrl?: string | null;
    inGameSpriteUrl?: string | null;
    iconUrl?: string | null;
    shootsProjectiles?: boolean;
    throwable?: boolean;
    holdOffsetX?: number;
    holdOffsetY?: number;
    holdRotation?: number;
    muzzleOffsetX?: number;
    muzzleOffsetY?: number;
  };
  onChange: (fields: {
    holdOffsetX?: number;
    holdOffsetY?: number;
    holdRotation?: number;
    muzzleOffsetX?: number;
    muzzleOffsetY?: number;
  }) => void;
}

export const ItemHoldPreview: React.FC<ItemHoldPreviewProps> = ({
  item,
  onChange,
}) => {
  const [aimAngleDeg, setAimAngleDeg] = useState<number>(0);
  const [animState, setAnimState] = useState<CharacterAnimationState>('idle');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  const holdOffsetX = typeof item.holdOffsetX === 'number' ? item.holdOffsetX : 0;
  const holdOffsetY = typeof item.holdOffsetY === 'number' ? item.holdOffsetY : 0;
  const holdRotation = typeof item.holdRotation === 'number' ? item.holdRotation : 0;
  const muzzleOffsetX = typeof item.muzzleOffsetX === 'number' ? item.muzzleOffsetX : 0;
  const muzzleOffsetY = typeof item.muzzleOffsetY === 'number' ? item.muzzleOffsetY : 0;
  const shootsProjectiles = Boolean(item.shootsProjectiles);

  const previewSpriteUrl = item.gearImageUrl || item.inGameSpriteUrl || item.iconUrl;
  const fullSpriteUrl = previewSpriteUrl ? getAssetUrl(previewSpriteUrl) : null;

  // Build gear descriptors for the ModularCharacterCanvas
  const selectedGear = useMemo(() => {
    if (!fullSpriteUrl) return [];
    return [
      {
        url: fullSpriteUrl,
        subType: 'WEAPON' as const,
        holdOffsetX,
        holdOffsetY,
        holdRotation,
        muzzleOffsetX,
        muzzleOffsetY,
        shootsProjectiles,
      },
    ];
  }, [fullSpriteUrl, holdOffsetX, holdOffsetY, holdRotation, muzzleOffsetX, muzzleOffsetY, shootsProjectiles]);

  // Convert aim angle from degrees to radians for Pixi character arm rotation
  const aimAngleRad = (aimAngleDeg * Math.PI) / 180;

  const handleResetHoldOffsets = () => {
    onChange({
      holdOffsetX: 0,
      holdOffsetY: 0,
      holdRotation: 0,
    });
  };

  const handleResetMuzzleOffsets = () => {
    onChange({
      muzzleOffsetX: 0,
      muzzleOffsetY: 0,
    });
  };

  const handleResetAll = () => {
    onChange({
      holdOffsetX: 0,
      holdOffsetY: 0,
      holdRotation: 0,
      muzzleOffsetX: 0,
      muzzleOffsetY: 0,
    });
    setAimAngleDeg(0);
  };

  return (
    <div className="item-hold-preview bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              Character Hold Preview & Offsets
            </h3>
            {shootsProjectiles && (
              <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                Shoots Projectiles
              </span>
            )}
            {item.throwable && (
              <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 rounded-full">
                Throwable
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Preview how the character holds this item. Adjust hand grip offsets, weapon angle, and projectile muzzle launch origin.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetAll}
          className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
        >
          Reset All Offsets
        </button>
      </div>

      {!previewSpriteUrl ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-2">
          <svg className="w-10 h-10 text-amber-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h4 className="text-sm font-black text-amber-900">No Image Uploaded Yet</h4>
          <p className="text-xs text-amber-700 max-w-md mx-auto">
            Upload a Gear Image, In-Game Sprite, or Item Icon in the sections below to preview how the character will hold and wield this item.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Character Canvas Preview & Viewport Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="canvas-backdrop rounded-2xl overflow-hidden border border-slate-700/50 shadow-inner flex flex-col items-center justify-center p-2 relative">
              <ModularCharacterCanvas
                width={380}
                height={400}
                scale={0.88 * zoomScale}
                animationState={animState}
                isPlaying={isPlaying}
                isFlipped={isFlipped}
                aimAngle={aimAngleRad}
                selectedGear={selectedGear}
                className="mx-auto"
              />

              {/* Viewport Floating Badges */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700 px-2 py-1 rounded-md text-[10px] font-bold text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Arm Aim: {aimAngleDeg}°</span>
              </div>

              {shootsProjectiles && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-950/80 backdrop-blur-sm border border-red-800/80 px-2 py-1 rounded-md text-[10px] font-bold text-red-300">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>Muzzle: ({muzzleOffsetX}, {muzzleOffsetY})</span>
                </div>
              )}
            </div>

            {/* Test Arm Aiming & Canvas Viewport Controls */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Test Arm Aim Angle
                </label>
                <div className="flex items-center gap-1 font-mono text-xs font-bold text-blue-600">
                  <span>{aimAngleDeg > 0 ? `+${aimAngleDeg}` : aimAngleDeg}°</span>
                  <button
                    type="button"
                    onClick={() => setAimAngleDeg(0)}
                    disabled={aimAngleDeg === 0}
                    className="cursor-pointer ml-1 text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-30 underline"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <input
                type="range"
                min="-75"
                max="75"
                step="1"
                value={aimAngleDeg}
                onChange={(e) => setAimAngleDeg(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />

              <div className="flex items-center justify-between gap-1 pt-1">
                {[-60, -30, 0, 30, 60].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setAimAngleDeg(deg)}
                    className={`cursor-pointer px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                      aimAngleDeg === deg
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {deg > 0 ? `+${deg}°` : `${deg}°`}
                  </button>
                ))}
              </div>

              {/* Animation & Zoom quick toggles */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="cursor-pointer text-[10px] font-bold px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition"
                  >
                    {isPlaying ? 'Pause Motion' : 'Play Motion'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimState(animState === 'idle' ? 'walk' : 'idle')}
                    className="cursor-pointer text-[10px] font-bold px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition"
                  >
                    Anim: {animState.toUpperCase()}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsFlipped(!isFlipped)}
                    className={`cursor-pointer text-[10px] font-bold px-2 py-1 rounded border transition ${
                      isFlipped ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Flip Facing
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale((prev) => (prev === 1.0 ? 1.25 : prev === 1.25 ? 0.8 : 1.0))}
                    className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition"
                  >
                    {zoomScale.toFixed(2)}x
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Offsets, Rotation & Muzzle Launch Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Hand Attachment Offsets & Rotation Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                  </svg>
                  Hand Grip Placement & Rotation
                </h4>
                {(holdOffsetX !== 0 || holdOffsetY !== 0 || holdRotation !== 0) && (
                  <button
                    type="button"
                    onClick={handleResetHoldOffsets}
                    className="cursor-pointer text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded transition"
                  >
                    Reset Grip
                  </button>
                )}
              </div>

              {/* Offset X */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <label htmlFor="hold-offset-x" className="cursor-pointer text-[11px] font-bold text-slate-600">
                    Horizontal Grip Offset (X)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ holdOffsetX: holdOffsetX - 1 })}
                      className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 flex items-center justify-center transition"
                    >
                      -
                    </button>
                    <input
                      id="hold-offset-x"
                      type="number"
                      value={holdOffsetX}
                      onChange={(e) => onChange({ holdOffsetX: Number(e.target.value) })}
                      className="w-16 p-1 text-center font-mono text-xs bg-white border border-slate-300 rounded font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => onChange({ holdOffsetX: holdOffsetX + 1 })}
                      className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 flex items-center justify-center transition"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-400 font-medium">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="1"
                  value={holdOffsetX}
                  onChange={(e) => onChange({ holdOffsetX: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Offset Y */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <label htmlFor="hold-offset-y" className="cursor-pointer text-[11px] font-bold text-slate-600">
                    Vertical Grip Offset (Y)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ holdOffsetY: holdOffsetY - 1 })}
                      className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 flex items-center justify-center transition"
                    >
                      -
                    </button>
                    <input
                      id="hold-offset-y"
                      type="number"
                      value={holdOffsetY}
                      onChange={(e) => onChange({ holdOffsetY: Number(e.target.value) })}
                      className="w-16 p-1 text-center font-mono text-xs bg-white border border-slate-300 rounded font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => onChange({ holdOffsetY: holdOffsetY + 1 })}
                      className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 flex items-center justify-center transition"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-400 font-medium">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="1"
                  value={holdOffsetY}
                  onChange={(e) => onChange({ holdOffsetY: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Hold Rotation */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <label htmlFor="hold-rotation" className="cursor-pointer text-[11px] font-bold text-slate-600">
                    Weapon / Item Rotation
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="hold-rotation"
                      type="number"
                      value={holdRotation}
                      onChange={(e) => onChange({ holdRotation: Number(e.target.value) })}
                      className="w-16 p-1 text-center font-mono text-xs bg-white border border-slate-300 rounded font-bold"
                    />
                    <span className="text-[10px] text-slate-400 font-medium">deg</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={holdRotation}
                  onChange={(e) => onChange({ holdRotation: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                {/* Quick Angle Presets */}
                <div className="flex items-center gap-1.5 pt-1">
                  {[-90, -45, 0, 45, 90, 180].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => onChange({ holdRotation: deg })}
                      className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                        holdRotation === deg
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white hover:bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Projectile Launch Muzzle Config (Only shown when shootsProjectiles is true) */}
            {shootsProjectiles && (
              <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-orange-200 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-orange-950 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" />
                        <line x1="12" y1="2" x2="12" y2="6" strokeWidth="2" />
                        <line x1="12" y1="18" x2="12" y2="22" strokeWidth="2" />
                        <line x1="2" y1="12" x2="6" y2="12" strokeWidth="2" />
                        <line x1="18" y1="12" x2="22" y2="12" strokeWidth="2" />
                      </svg>
                      Projectile Launch Origin (Muzzle)
                    </h4>
                    <p className="text-[11px] text-orange-700 font-medium mt-0.5">
                      Specifies where bullets and muzzle flash spawn in weapon coordinates. Automatically rotates with arm aim.
                    </p>
                  </div>
                  {(muzzleOffsetX !== 0 || muzzleOffsetY !== 0) && (
                    <button
                      type="button"
                      onClick={handleResetMuzzleOffsets}
                      className="cursor-pointer text-[10px] font-bold text-orange-800 hover:text-orange-950 bg-white hover:bg-orange-100 border border-orange-300 px-2 py-1 rounded transition"
                    >
                      Reset Muzzle
                    </button>
                  )}
                </div>

                {/* Muzzle X */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-orange-900">
                    <label htmlFor="muzzle-offset-x" className="cursor-pointer text-[11px] font-bold text-orange-800">
                      Muzzle Horizontal Offset (X)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChange({ muzzleOffsetX: muzzleOffsetX - 1 })}
                        className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-orange-100 border border-orange-300 font-bold text-orange-900 flex items-center justify-center transition"
                      >
                        -
                      </button>
                      <input
                        id="muzzle-offset-x"
                        type="number"
                        value={muzzleOffsetX}
                        onChange={(e) => onChange({ muzzleOffsetX: Number(e.target.value) })}
                        className="w-16 p-1 text-center font-mono text-xs bg-white border border-orange-300 rounded font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => onChange({ muzzleOffsetX: muzzleOffsetX + 1 })}
                        className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-orange-100 border border-orange-300 font-bold text-orange-900 flex items-center justify-center transition"
                      >
                        +
                      </button>
                      <span className="text-[10px] text-orange-600 font-medium">px</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="-120"
                    max="120"
                    step="1"
                    value={muzzleOffsetX}
                    onChange={(e) => onChange({ muzzleOffsetX: Number(e.target.value) })}
                    className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Muzzle Y */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-orange-900">
                    <label htmlFor="muzzle-offset-y" className="cursor-pointer text-[11px] font-bold text-orange-800">
                      Muzzle Vertical Offset (Y)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChange({ muzzleOffsetY: muzzleOffsetY - 1 })}
                        className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-orange-100 border border-orange-300 font-bold text-orange-900 flex items-center justify-center transition"
                      >
                        -
                      </button>
                      <input
                        id="muzzle-offset-y"
                        type="number"
                        value={muzzleOffsetY}
                        onChange={(e) => onChange({ muzzleOffsetY: Number(e.target.value) })}
                        className="w-16 p-1 text-center font-mono text-xs bg-white border border-orange-300 rounded font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => onChange({ muzzleOffsetY: muzzleOffsetY + 1 })}
                        className="cursor-pointer w-6 h-6 rounded bg-white hover:bg-orange-100 border border-orange-300 font-bold text-orange-900 flex items-center justify-center transition"
                      >
                        +
                      </button>
                      <span className="text-[10px] text-orange-600 font-medium">px</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="-80"
                    max="80"
                    step="1"
                    value={muzzleOffsetY}
                    onChange={(e) => onChange({ muzzleOffsetY: Number(e.target.value) })}
                    className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemHoldPreview;
