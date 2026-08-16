import React, { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import ModularCharacterCanvas, {
  type CharacterAnimationState,
  type SkeletonManifest,
} from '../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import { getAssetUrl, MINER_SKELETON_PATH, type GearSubType } from '@mine-me/shared';
import './CharacterViewer.css';

type ActiveTab = 'parts' | 'gear' | 'json';

export default function CharacterViewer() {
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<SkeletonManifest | null>(null);
  const [initialManifest, setInitialManifest] = useState<SkeletonManifest | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Animation & Viewport controls
  const [animState, setAnimState] = useState<CharacterAnimationState>('idle');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.0);
  const [rootOffsetY, setRootOffsetY] = useState<number>(0);

  // Debug toggles
  const [showJoints, setShowJoints] = useState<boolean>(true);
  const [showBones, setShowBones] = useState<boolean>(true);
  const [showBbox, setShowBbox] = useState<boolean>(false);

  // Part inspection & isolation
  const [hiddenParts, setHiddenParts] = useState<string[]>([]);
  const [highlightedPart, setHighlightedPart] = useState<string | null>(null);

  // Live overrides for part transformation editing
  const [partOverrides, setPartOverrides] = useState<
    Record<
      string,
      {
        width: number;
        height: number;
        offsetX: number;
        offsetY: number;
        pivotX: number;
        pivotY: number;
      }
    >
  >({});

  // Gear testing socket
  const [selectedGear, setSelectedGear] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('parts');

  const skeletonUrl = getAssetUrl(MINER_SKELETON_PATH);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      fetch(`${skeletonUrl}?t=${Date.now()}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load skeleton manifest (${r.statusText})`);
        return r.json();
      }),
      fetchWithAuth('/api/admin/items')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([manifestData, itemsData]) => {
        if (!active) return;
        setManifest(manifestData);
        setInitialManifest(JSON.parse(JSON.stringify(manifestData)));

        // Initialize overrides from manifest
        const initialOverrides: typeof partOverrides = {};
        if (manifestData?.parts) {
          for (const [pName, pDef] of Object.entries<any>(manifestData.parts)) {
            initialOverrides[pName] = {
              width: pDef.width,
              height: pDef.height,
              offsetX: pDef.offset_from_pelvis[0],
              offsetY: pDef.offset_from_pelvis[1],
              pivotX: pDef.pivot_anchor[0],
              pivotY: pDef.pivot_anchor[1],
            };
          }
        }
        setPartOverrides(initialOverrides);
        setItems(Array.isArray(itemsData) ? itemsData : []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('[CharacterViewer] Error:', err);
        toast.error(err.message || 'Failed to load character data');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [skeletonUrl]);

  // Handle tuning input changes
  const handlePartValueChange = (
    partName: string,
    field: 'width' | 'height' | 'offsetX' | 'offsetY' | 'pivotX' | 'pivotY',
    value: number
  ) => {
    setPartOverrides((prev) => {
      const pDef = manifest?.parts?.[partName];
      const current = prev[partName] || {
        width: pDef?.width ?? 100,
        height: pDef?.height ?? 100,
        offsetX: pDef?.offset_from_pelvis?.[0] ?? 0,
        offsetY: pDef?.offset_from_pelvis?.[1] ?? 0,
        pivotX: pDef?.pivot_anchor?.[0] ?? 0.5,
        pivotY: pDef?.pivot_anchor?.[1] ?? 0.5,
      };
      return {
        ...prev,
        [partName]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // Adjust numeric value by step
  const stepPartValue = (
    partName: string,
    field: 'width' | 'height' | 'offsetX' | 'offsetY' | 'pivotX' | 'pivotY',
    delta: number,
    isFloat = false
  ) => {
    const pDef = manifest?.parts?.[partName];
    const defaultVal =
      field === 'width'
        ? (pDef?.width ?? 100)
        : field === 'height'
        ? (pDef?.height ?? 100)
        : field === 'offsetX'
        ? (pDef?.offset_from_pelvis?.[0] ?? 0)
        : field === 'offsetY'
        ? (pDef?.offset_from_pelvis?.[1] ?? 0)
        : field === 'pivotX'
        ? (pDef?.pivot_anchor?.[0] ?? 0.5)
        : (pDef?.pivot_anchor?.[1] ?? 0.5);

    const currentVal = partOverrides[partName]?.[field] ?? defaultVal;
    const newVal = isFloat
      ? Math.round((currentVal + delta) * 100) / 100
      : Math.round(currentVal + delta);
    handlePartValueChange(partName, field, newVal);
  };

  // Reset a specific part to initial manifest values
  const resetPartToInitial = (partName: string) => {
    if (!initialManifest?.parts?.[partName]) return;
    const pDef = initialManifest.parts[partName];
    setPartOverrides((prev) => ({
      ...prev,
      [partName]: {
        width: pDef.width,
        height: pDef.height,
        offsetX: pDef.offset_from_pelvis[0],
        offsetY: pDef.offset_from_pelvis[1],
        pivotX: pDef.pivot_anchor[0],
        pivotY: pDef.pivot_anchor[1],
      },
    }));
    toast.info(`Reset ${partName} to saved defaults`);
  };

  // Toggle part visibility
  const togglePartVisibility = (partName: string) => {
    setHiddenParts((prev) =>
      prev.includes(partName) ? prev.filter((p) => p !== partName) : [...prev, partName]
    );
  };

  // Build current manifest snapshot with overrides applied
  const currentUpdatedManifest = React.useMemo(() => {
    if (!manifest) return null;
    const updated = JSON.parse(JSON.stringify(manifest)) as SkeletonManifest;
    for (const [pName, ov] of Object.entries(partOverrides)) {
      if (updated.parts[pName]) {
        updated.parts[pName].width = ov.width;
        updated.parts[pName].height = ov.height;
        updated.parts[pName].offset_from_pelvis = [ov.offsetX, ov.offsetY];
        updated.parts[pName].pivot_anchor = [ov.pivotX, ov.pivotY];
      }
    }
    return updated;
  }, [manifest, partOverrides]);

  // Save changes back to server
  const handleSaveChanges = async () => {
    if (!currentUpdatedManifest) return;

    try {
      setIsSaving(true);
      const res = await fetchWithAuth('/api/admin/characters/skeleton', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: currentUpdatedManifest }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save skeleton configuration');
      }

      setManifest(currentUpdatedManifest);
      setInitialManifest(JSON.parse(JSON.stringify(currentUpdatedManifest)));
      toast.success('Character sprite coordinates & dimensions saved successfully!');
    } catch (err: any) {
      console.error('[CharacterViewer] Save error:', err);
      toast.error(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyJson = () => {
    if (!currentUpdatedManifest) return;
    navigator.clipboard.writeText(JSON.stringify(currentUpdatedManifest, null, 2));
    toast.success('Skeleton manifest JSON copied to clipboard!');
  };

  // Convert selectedGear to descriptors
  const gearDescriptors = React.useMemo(() => {
    return Object.entries(selectedGear)
      .map(([slot, itemId]) => {
        if (!itemId) return null;
        const item = items.find((i) => i.id === itemId);
        if (!item || !item.gearImageUrl) return null;
        return {
          url: getAssetUrl(item.gearImageUrl),
          subType: slot as GearSubType,
        };
      })
      .filter((g): g is { url: string; subType: GearSubType } => g !== null);
  }, [selectedGear, items]);

  const gearSlots: GearSubType[] = [
    'HEAD',
    'SHOULDERS',
    'CHEST',
    'GAUNTLETS',
    'LEGGINGS',
    'BOOTS',
    'WEAPON',
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <LoadingSpinner />
        <span className="text-sm font-semibold text-slate-500 mt-4">
          Loading Character Model & Slices...
        </span>
      </div>
    );
  }

  const partsList = manifest ? Object.entries(manifest.parts) : [];

  return (
    <div className="character-viewer-page space-y-6">
      {/* Header Overview */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Character Model & Rig Inspector
            </h1>
            <span className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded-full">
              v{manifest?.version || '2.0'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Fine-tune sprite sizes, X/Y pelvis offsets, pivot anchors, and test procedural animations in real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (initialManifest?.parts) {
                const initOv: typeof partOverrides = {};
                for (const [pName, pDef] of Object.entries<any>(initialManifest.parts)) {
                  initOv[pName] = {
                    width: pDef.width,
                    height: pDef.height,
                    offsetX: pDef.offset_from_pelvis[0],
                    offsetY: pDef.offset_from_pelvis[1],
                    pivotX: pDef.pivot_anchor[0],
                    pivotY: pDef.pivot_anchor[1],
                  };
                }
                setPartOverrides(initOv);
              }
              setHiddenParts([]);
              setHighlightedPart(null);
              setSelectedGear({});
              setScale(1.0);
              setSpeedMultiplier(1.0);
              setAnimState('idle');
              setIsFlipped(false);
              toast.info('Viewer reset to defaults');
            }}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Reset All
          </button>

          <button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 rounded-xl shadow-sm hover:shadow transition cursor-pointer flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <LoadingSpinner />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>💾 Save Rig Coordinates</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Left Stage, Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Animated Character Viewport (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center sticky top-4">
            {/* Viewport Canvas */}
            <ModularCharacterCanvas
              manifestUrl={skeletonUrl}
              animationState={animState}
              speedMultiplier={speedMultiplier}
              isPlaying={isPlaying}
              isFlipped={isFlipped}
              scale={scale}
              showDebugJoints={showJoints}
              showDebugBones={showBones}
              showDebugBbox={showBbox}
              hiddenParts={hiddenParts}
              highlightedPart={highlightedPart}
              selectedGear={gearDescriptors}
              partOverrides={partOverrides}
              rootOffsetY={rootOffsetY}
              width={420}
              height={480}
            />

            {/* Animation State Switcher */}
            <div className="w-full mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Animation:
              </span>
              <div className="flex items-center gap-1.5">
                {(['idle', 'walk', 'mine'] as CharacterAnimationState[]).map((state) => (
                  <button
                    key={state}
                    onClick={() => setAnimState(state)}
                    className={`px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
                      animState === state
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Controls & Speed Multiplier */}
            <div className="w-full mt-3 pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                      isPlaying
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>

                  <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                      isFlipped
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Flip: {isFlipped ? 'Left ◀' : 'Right ▶'}
                  </button>
                </div>

                {/* Scale Controls */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-700 px-1">
                    {scale.toFixed(2)}x
                  </span>
                  <button
                    onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}
                    className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Speed Slider */}
              <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Speed: {speedMultiplier.toFixed(2)}x
                </span>
                <div className="flex items-center gap-2 flex-grow max-w-xs">
                  <input
                    type="range"
                    min="0.25"
                    max="2.5"
                    step="0.05"
                    value={speedMultiplier}
                    onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                    className="w-full cursor-pointer accent-blue-600"
                  />
                  <button
                    onClick={() => setSpeedMultiplier(1.0)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 bg-slate-200 rounded cursor-pointer"
                  >
                    1x
                  </button>
                </div>
              </div>

              {/* Viewport Origin / Root Y Offset Slider */}
              <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Root Y: {rootOffsetY}px
                </span>
                <div className="flex items-center gap-2 flex-grow max-w-xs">
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    step="5"
                    value={rootOffsetY}
                    onChange={(e) => setRootOffsetY(parseInt(e.target.value) || 0)}
                    className="w-full cursor-pointer accent-emerald-600"
                  />
                  <button
                    onClick={() => setRootOffsetY(0)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 bg-slate-200 rounded cursor-pointer"
                  >
                    0
                  </button>
                </div>
              </div>

              {/* Debug Layer Toggles */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Debug Overlays:
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showJoints}
                      onChange={(e) => setShowJoints(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    Joints
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBones}
                      onChange={(e) => setShowBones(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    Bones
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBbox}
                      onChange={(e) => setShowBbox(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    Boxes
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Slices, Gear Tester & Manifest Tabs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tabs navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveTab('parts')}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'parts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Adjust Parts & Pivots ({partsList.length})
            </button>

            <button
              onClick={() => setActiveTab('gear')}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'gear'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Gear Socket Tester
            </button>

            <button
              onClick={() => setActiveTab('json')}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'json'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Live Skeleton JSON
            </button>
          </div>

          {/* TAB 1: Sliced Parts Inspector & Live Coordinate Tuner */}
          {activeTab === 'parts' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <span>
                  💡 <strong>Tip:</strong> Use the <strong>+ / - buttons</strong> or type values to adjust dimensions, pelvis offsets (X/Y), and pivot anchors live. Click <strong>💾 Save Rig Coordinates</strong> above when satisfied.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {partsList.map(([partName, partDef]) => {
                  const isHidden = hiddenParts.includes(partName);
                  const isHighlighted = highlightedPart === partName;
                  const partImageUrl = getAssetUrl(
                    `/assets/sprites/characters/miner/${partDef.file}`
                  );
                  const currentValues = partOverrides[partName] || {
                    width: partDef.width,
                    height: partDef.height,
                    offsetX: partDef.offset_from_pelvis[0],
                    offsetY: partDef.offset_from_pelvis[1],
                    pivotX: partDef.pivot_anchor[0],
                    pivotY: partDef.pivot_anchor[1],
                  };

                  return (
                    <div
                      key={partName}
                      className={`part-card bg-white p-5 rounded-2xl border shadow-sm transition ${
                        isHighlighted
                          ? 'border-yellow-400 ring-2 ring-yellow-300'
                          : isHidden
                          ? 'border-slate-200 opacity-60'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Card Top: Title & Quick Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-800 text-base capitalize">
                            {partName.replace('_', ' ')}
                          </h3>
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 text-blue-700 rounded-md border border-blue-100 uppercase">
                            Slot: {partDef.slot}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Z: {partDef.z_index}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => resetPartToInitial(partName)}
                            className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                          >
                            Reset
                          </button>

                          <button
                            onClick={() =>
                              setHighlightedPart(isHighlighted ? null : partName)
                            }
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                              isHighlighted
                                ? 'bg-yellow-400 text-slate-900 border-yellow-500 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isHighlighted ? 'Highlighted' : 'Highlight'}
                          </button>

                          <button
                            onClick={() => togglePartVisibility(partName)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                              isHidden
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {isHidden ? 'Hidden' : 'Visible'}
                          </button>
                        </div>
                      </div>

                      {/* Main Controls Grid */}
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Sprite Thumbnail */}
                        <div className="checkerboard-bg w-28 h-28 rounded-2xl flex items-center justify-center p-2 border border-slate-700 shrink-0 shadow-inner">
                          <img
                            src={partImageUrl}
                            alt={partName}
                            className="max-w-full max-h-full object-contain filter drop-shadow-md"
                          />
                        </div>

                        {/* Interactive Tuning Sliders / Steppers */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow w-full">
                          {/* Col 1: Position Offset (X & Y) */}
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                              📍 Offset from Pelvis
                            </span>

                            {/* Offset X */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>X Offset:</span>
                                <span className="font-bold text-blue-600">{currentValues.offsetX} px</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetX', -5)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -5
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetX', -1)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  value={currentValues.offsetX}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'offsetX',
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetX', 1)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetX', 5)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +5
                                </button>
                              </div>
                            </div>

                            {/* Offset Y */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>Y Offset:</span>
                                <span className="font-bold text-blue-600">{currentValues.offsetY} px</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetY', -5)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -5
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetY', -1)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  value={currentValues.offsetY}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'offsetY',
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetY', 1)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'offsetY', 5)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +5
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Dimensions (Width & Height) */}
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                              📐 Size (Width × Height)
                            </span>

                            {/* Width */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>Width:</span>
                                <span className="font-bold text-emerald-600">{currentValues.width} px</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'width', -10)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'width', -2)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -2
                                </button>
                                <input
                                  type="number"
                                  value={currentValues.width}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'width',
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'width', 2)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +2
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'width', 10)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +10
                                </button>
                              </div>
                            </div>

                            {/* Height */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>Height:</span>
                                <span className="font-bold text-emerald-600">{currentValues.height} px</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'height', -10)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'height', -2)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -2
                                </button>
                                <input
                                  type="number"
                                  value={currentValues.height}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'height',
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'height', 2)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +2
                                </button>
                                <button
                                  onClick={() => stepPartValue(partName, 'height', 10)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Col 3: Pivot Anchor (0.0 to 1.0) */}
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                              🎯 Joint Pivot Anchor
                            </span>

                            {/* Pivot X */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>Anchor X:</span>
                                <span className="font-bold text-purple-600">{currentValues.pivotX}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'pivotX', -0.05, true)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  value={currentValues.pivotX}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'pivotX',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'pivotX', 0.05, true)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Pivot Y */}
                            <div>
                              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                                <span>Anchor Y:</span>
                                <span className="font-bold text-purple-600">{currentValues.pivotY}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => stepPartValue(partName, 'pivotY', -0.05, true)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  value={currentValues.pivotY}
                                  onChange={(e) =>
                                    handlePartValueChange(
                                      partName,
                                      'pivotY',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                                />
                                <button
                                  onClick={() => stepPartValue(partName, 'pivotY', 0.05, true)}
                                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Gear Socket Tester */}
          {activeTab === 'gear' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
              <div>
                <h3 className="font-black text-slate-800 text-base">
                  Joint Socket Gear Attachments
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select gear items from the database to attach directly to the animated joint nodes
                  live in the viewer.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {gearSlots.map((slot) => {
                  const availableItems = items.filter(
                    (i) => i.type === 'GEAR' && i.subType === slot
                  );

                  return (
                    <div key={slot} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="block text-xs font-bold text-slate-600 mb-2">
                        {slot} Slot
                      </label>
                      <select
                        value={selectedGear[slot] || ''}
                        onChange={(e) =>
                          setSelectedGear({ ...selectedGear, [slot]: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="">-- None Equipped --</option>
                        {availableItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.rarity || 'Common'})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {gearDescriptors.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-800">
                    Active Gear Overlays: {gearDescriptors.length} piece(s)
                  </span>
                  <button
                    onClick={() => setSelectedGear({})}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    Clear All Gear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Raw Live JSON Manifest */}
          {activeTab === 'json' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-800 text-base">miner_skeleton.json</h3>
                  <span className="text-xs text-slate-500">Live JSON configuration with real-time tuning values</span>
                </div>
                <button
                  onClick={handleCopyJson}
                  className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition cursor-pointer"
                >
                  📋 Copy JSON
                </button>
              </div>

              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-[500px] border border-slate-800">
                {JSON.stringify(currentUpdatedManifest, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
