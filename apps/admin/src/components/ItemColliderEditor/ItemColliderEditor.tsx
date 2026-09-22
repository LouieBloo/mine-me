import React, { useState, useRef } from 'react';
import type { ItemPhysicsConfig, ItemColliderType } from '@mine-me/shared';
import './ItemColliderEditor.css';

export interface ItemColliderEditorProps {
  item: {
    id?: string;
    name: string;
    subType: string;
    iconUrl?: string | null;
    gearImageUrl?: string | null;
  };
  physicsConfig: ItemPhysicsConfig | null | undefined;
  onChange: (config: ItemPhysicsConfig) => void;
}

const DEFAULT_CONFIG: ItemPhysicsConfig = {
  hasPhysics: false,
  colliderType: 'NONE',
  colliderWidth: 16,
  colliderHeight: 16,
  colliderRadius: 8,
  colliderOffsetX: 0,
  colliderOffsetY: 0,
  mass: 1.0,
  friction: 0.4,
  restitution: 0.45,
  gravityScale: 1.0,
  linearDamping: 0.05,
  angularDamping: 0.4,
  allowRotation: true,
  throwPower: 14.0,
  fuseSeconds: 4.0,
};

export default function ItemColliderEditor({
  item,
  physicsConfig,
  onChange,
}: ItemColliderEditorProps) {
  const currentConfig: ItemPhysicsConfig = {
    ...DEFAULT_CONFIG,
    ...(physicsConfig || {}),
  };

  const [zoom, setZoom] = useState<number>(6); // 6x magnification
  const [activeDrag, setActiveDrag] = useState<'center' | 'resize-circle' | 'resize-rect' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [initialDimensions, setInitialDimensions] = useState<{
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    radius: number;
  }>({
    offsetX: currentConfig.colliderOffsetX ?? 0,
    offsetY: currentConfig.colliderOffsetY ?? 0,
    width: currentConfig.colliderWidth ?? 16,
    height: currentConfig.colliderHeight ?? 16,
    radius: currentConfig.colliderRadius ?? 8,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);

  const isDynamite =
    item.subType === 'DYNAMITE' ||
    (item.name && item.name.toLowerCase().includes('dynamite'));

  const spriteSrc = item.iconUrl || item.gearImageUrl || null;

  const updateConfig = (patch: Partial<ItemPhysicsConfig>) => {
    onChange({
      ...currentConfig,
      ...patch,
    });
  };

  // Center coordinate of the 256x256 display canvas
  const canvasCenter = 128;
  const offsetX = currentConfig.colliderOffsetX ?? 0;
  const offsetY = currentConfig.colliderOffsetY ?? 0;
  const screenCenterX = canvasCenter + offsetX * zoom;
  const screenCenterY = canvasCenter + offsetY * zoom;

  const colliderWidth = currentConfig.colliderWidth ?? 16;
  const colliderHeight = currentConfig.colliderHeight ?? 16;
  const colliderRadius = currentConfig.colliderRadius ?? 8;

  const screenWidth = colliderWidth * zoom;
  const screenHeight = colliderHeight * zoom;
  const screenRadius = colliderRadius * zoom;

  // Handle pointer interactions on SVG
  const handlePointerDown = (
    type: 'center' | 'resize-circle' | 'resize-rect',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag(type);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialDimensions({
      offsetX,
      offsetY,
      width: colliderWidth,
      height: colliderHeight,
      radius: colliderRadius,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !dragStart) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const deltaPixelX = Math.round(dx / zoom);
    const deltaPixelY = Math.round(dy / zoom);

    if (activeDrag === 'center') {
      updateConfig({
        colliderOffsetX: initialDimensions.offsetX + deltaPixelX,
        colliderOffsetY: initialDimensions.offsetY + deltaPixelY,
      });
    } else if (activeDrag === 'resize-circle') {
      // Dragging circle radius handle
      const newRadius = Math.max(1, Math.min(32, initialDimensions.radius + deltaPixelX));
      updateConfig({ colliderRadius: newRadius });
    } else if (activeDrag === 'resize-rect') {
      // Dragging bottom-right rectangle corner handle
      const newWidth = Math.max(2, Math.min(64, initialDimensions.width + deltaPixelX * 2));
      const newHeight = Math.max(2, Math.min(64, initialDimensions.height + deltaPixelY * 2));
      updateConfig({
        colliderWidth: newWidth,
        colliderHeight: newHeight,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {}
      setActiveDrag(null);
      setDragStart(null);
    }
  };

  const handleShapeChange = (shape: ItemColliderType) => {
    updateConfig({
      colliderType: shape,
      hasPhysics: shape !== 'NONE',
    });
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>🎯</span> 2D Collider & Rigid Body Editor
          </h3>
          <p className="text-xs text-slate-500">
            Define physics colliders directly over the item sprite and customize dynamics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
              currentConfig.hasPhysics && currentConfig.colliderType !== 'NONE'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            {currentConfig.hasPhysics && currentConfig.colliderType !== 'NONE'
              ? `${currentConfig.colliderType} COLLIDER ACTIVE`
              : 'NO COLLIDER'}
          </span>
        </div>
      </div>

      {/* Main Grid: Visual Canvas on left, Controls on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual Sprite & Collider Overlay */}
        <div className="lg:col-span-5 flex flex-col items-center space-y-4">
          <div className="item-collider-canvas-wrapper shadow-inner border border-slate-700">
            {/* Background Sprite Image */}
            {spriteSrc ? (
              <img
                src={spriteSrc}
                alt={item.name}
                className="item-collider-sprite"
                style={{
                  width: `${32 * zoom}px`,
                  height: `${32 * zoom}px`,
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs p-4 text-center">
                <span>⚠️ No Icon Uploaded</span>
                <span className="text-[10px] text-slate-600 mt-1">Upload a 32×32 PNG icon to trace collider</span>
              </div>
            )}

            {/* SVG Collider Overlay with Interactive Handles */}
            <svg
              ref={svgRef}
              className="item-collider-svg"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Center Coordinate Axis Crosshairs */}
              <line
                x1={canvasCenter}
                y1={0}
                x2={canvasCenter}
                y2={256}
                stroke="rgba(255, 255, 255, 0.15)"
                strokeDasharray="2 2"
              />
              <line
                x1={0}
                y1={canvasCenter}
                x2={256}
                y2={canvasCenter}
                stroke="rgba(255, 255, 255, 0.15)"
                strokeDasharray="2 2"
              />

              {/* Circle Collider */}
              {currentConfig.colliderType === 'CIRCLE' && (
                <g>
                  <circle
                    cx={screenCenterX}
                    cy={screenCenterY}
                    r={screenRadius}
                    fill="rgba(16, 185, 129, 0.25)"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray={activeDrag ? '4 2' : undefined}
                  />
                  {/* Center Drag Handle */}
                  <circle
                    cx={screenCenterX}
                    cy={screenCenterY}
                    r={6}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={2}
                    className="item-collider-handle"
                    onPointerDown={e => handlePointerDown('center', e)}
                  />
                  {/* Radius Resize Handle */}
                  <circle
                    cx={screenCenterX + screenRadius}
                    cy={screenCenterY}
                    r={5}
                    fill="#34d399"
                    stroke="#0f172a"
                    strokeWidth={1.5}
                    className="item-collider-handle item-collider-handle-resize"
                    onPointerDown={e => handlePointerDown('resize-circle', e)}
                  />
                </g>
              )}

              {/* Rectangle Collider */}
              {currentConfig.colliderType === 'RECTANGLE' && (
                <g>
                  <rect
                    x={screenCenterX - screenWidth / 2}
                    y={screenCenterY - screenHeight / 2}
                    width={screenWidth}
                    height={screenHeight}
                    rx={3}
                    fill="rgba(56, 189, 248, 0.25)"
                    stroke="#0284c7"
                    strokeWidth={2}
                    strokeDasharray={activeDrag ? '4 2' : undefined}
                  />
                  {/* Center Drag Handle */}
                  <circle
                    cx={screenCenterX}
                    cy={screenCenterY}
                    r={6}
                    fill="#0284c7"
                    stroke="#ffffff"
                    strokeWidth={2}
                    className="item-collider-handle"
                    onPointerDown={e => handlePointerDown('center', e)}
                  />
                  {/* Bottom-Right Corner Resize Handle */}
                  <circle
                    cx={screenCenterX + screenWidth / 2}
                    cy={screenCenterY + screenHeight / 2}
                    r={5}
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth={1.5}
                    className="item-collider-handle item-collider-handle-resize"
                    onPointerDown={e => handlePointerDown('resize-rect', e)}
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Canvas Zoom & Quick Reset Controls */}
          <div className="flex items-center justify-between w-full max-w-[256px] text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold">Zoom:</span>
              {[4, 6, 8].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={`cursor-pointer px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                    zoom === z ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateConfig({ colliderOffsetX: 0, colliderOffsetY: 0 })}
              className="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
            >
              Center (0,0)
            </button>
          </div>
        </div>

        {/* Right Column: Shape Selector, Dimension Inputs & Physics Properties */}
        <div className="lg:col-span-7 space-y-5">
          {/* Shape Selector Buttons */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Collider Geometry</label>
            <div className="grid grid-cols-3 gap-2">
              {(['NONE', 'CIRCLE', 'RECTANGLE'] as ItemColliderType[]).map(shape => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => handleShapeChange(shape)}
                  className={`cursor-pointer py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                    currentConfig.colliderType === shape
                      ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{shape === 'NONE' ? '🚫' : shape === 'CIRCLE' ? '⚪' : '🟦'}</span>
                  {shape === 'NONE' ? 'None' : shape === 'CIRCLE' ? 'Circle' : 'Rectangle'}
                </button>
              ))}
            </div>
          </div>

          {/* Collider Dimensions & Offsets (When Shape is Active) */}
          {currentConfig.colliderType !== 'NONE' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                {currentConfig.colliderType === 'CIRCLE' ? 'Circle Dimensions (Pixels)' : 'Rectangle Dimensions (Pixels)'}
              </h4>

              {currentConfig.colliderType === 'CIRCLE' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="colliderRadius" className="font-semibold text-slate-700">Radius</label>
                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{colliderRadius} px</span>
                  </div>
                  <input
                    id="colliderRadius"
                    type="range"
                    min="2"
                    max="24"
                    step="1"
                    value={colliderRadius}
                    onChange={e => updateConfig({ colliderRadius: parseInt(e.target.value, 10) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>
              )}

              {currentConfig.colliderType === 'RECTANGLE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <label htmlFor="colliderWidth" className="font-semibold text-slate-700">Width</label>
                      <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{colliderWidth} px</span>
                    </div>
                    <input
                      id="colliderWidth"
                      type="range"
                      min="2"
                      max="32"
                      step="1"
                      value={colliderWidth}
                      onChange={e => updateConfig({ colliderWidth: parseInt(e.target.value, 10) })}
                      className="w-full item-collider-slider cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <label htmlFor="colliderHeight" className="font-semibold text-slate-700">Height</label>
                      <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{colliderHeight} px</span>
                    </div>
                    <input
                      id="colliderHeight"
                      type="range"
                      min="2"
                      max="32"
                      step="1"
                      value={colliderHeight}
                      onChange={e => updateConfig({ colliderHeight: parseInt(e.target.value, 10) })}
                      className="w-full item-collider-slider cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Offset X and Offset Y */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="colliderOffsetX" className="font-semibold text-slate-700">Offset X</label>
                    <span className="font-bold text-blue-600">{offsetX} px</span>
                  </div>
                  <input
                    id="colliderOffsetX"
                    type="range"
                    min="-16"
                    max="16"
                    step="1"
                    value={offsetX}
                    onChange={e => updateConfig({ colliderOffsetX: parseInt(e.target.value, 10) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="colliderOffsetY" className="font-semibold text-slate-700">Offset Y</label>
                    <span className="font-bold text-blue-600">{offsetY} px</span>
                  </div>
                  <input
                    id="colliderOffsetY"
                    type="range"
                    min="-16"
                    max="16"
                    step="1"
                    value={offsetY}
                    onChange={e => updateConfig({ colliderOffsetY: parseInt(e.target.value, 10) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* General Rigid Body Dynamics (Active when hasPhysics is true) */}
          {currentConfig.colliderType !== 'NONE' && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Rigid Body Dynamics (Planck.js)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mass */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="physicsMass" className="font-semibold text-slate-700">Mass (kg)</label>
                    <span className="font-bold text-blue-600">{(currentConfig.mass ?? 1.0).toFixed(1)}</span>
                  </div>
                  <input
                    id="physicsMass"
                    type="range"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={currentConfig.mass ?? 1.0}
                    onChange={e => updateConfig({ mass: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>

                {/* Restitution / Bounciness */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="physicsRestitution" className="font-semibold text-slate-700">Bounciness (Restitution)</label>
                    <span className="font-bold text-blue-600">{(currentConfig.restitution ?? 0.45).toFixed(2)}</span>
                  </div>
                  <input
                    id="physicsRestitution"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={currentConfig.restitution ?? 0.45}
                    onChange={e => updateConfig({ restitution: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>

                {/* Friction */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="physicsFriction" className="font-semibold text-slate-700">Surface Friction</label>
                    <span className="font-bold text-blue-600">{(currentConfig.friction ?? 0.4).toFixed(2)}</span>
                  </div>
                  <input
                    id="physicsFriction"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={currentConfig.friction ?? 0.4}
                    onChange={e => updateConfig({ friction: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>

                {/* Gravity Scale */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="physicsGravityScale" className="font-semibold text-slate-700">Gravity Scale</label>
                    <span className="font-bold text-blue-600">{(currentConfig.gravityScale ?? 1.0).toFixed(1)}x</span>
                  </div>
                  <input
                    id="physicsGravityScale"
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={currentConfig.gravityScale ?? 1.0}
                    onChange={e => updateConfig({ gravityScale: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>
              </div>

              {/* Allow Rotation Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800">Tumbling & Angular Rotation</span>
                  <p className="text-[11px] text-slate-500">Allow body to spin and tumble upon impacts</p>
                </div>
                <button
                  type="button"
                  id="allowRotationToggle"
                  aria-label="Toggle rotation"
                  onClick={() => updateConfig({ allowRotation: currentConfig.allowRotation === false ? true : false })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    currentConfig.allowRotation !== false ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      currentConfig.allowRotation !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Conditional Dynamite Action Settings (Only shown for Dynamite items per user request) */}
          {isDynamite && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-base">🧨</span>
                <div>
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                    Dynamite Action Parameters
                  </h4>
                  <p className="text-[11px] text-amber-700">Special action settings for explosive dynamite</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="dynamiteThrowPower" className="font-semibold text-amber-900">Throw Power</label>
                    <span className="font-bold text-amber-800">{currentConfig.throwPower ?? 14.0}</span>
                  </div>
                  <input
                    id="dynamiteThrowPower"
                    type="range"
                    min="5"
                    max="30"
                    step="0.5"
                    value={currentConfig.throwPower ?? 14.0}
                    onChange={e => updateConfig({ throwPower: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor="dynamiteFuseSeconds" className="font-semibold text-amber-900">Fuse Duration (seconds)</label>
                    <span className="font-bold text-amber-800">{(currentConfig.fuseSeconds ?? 4.0).toFixed(1)}s</span>
                  </div>
                  <input
                    id="dynamiteFuseSeconds"
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={currentConfig.fuseSeconds ?? 4.0}
                    onChange={e => updateConfig({ fuseSeconds: parseFloat(e.target.value) })}
                    className="w-full item-collider-slider cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
