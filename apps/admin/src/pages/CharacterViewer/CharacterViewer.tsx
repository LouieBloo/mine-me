import { useState, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import ModularCharacterCanvas, {
  type CharacterAnimationState,
} from '../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import { getAssetUrl, type GearSubType } from '@mine-me/shared';
import { useCharacterManifest } from './hooks/useCharacterManifest';
import { ViewportControls } from './components/ViewportControls/ViewportControls';
import { PartsTuningPanel } from './components/PartsTuningPanel/PartsTuningPanel';
import { GearSocketTester } from './components/GearSocketTester/GearSocketTester';
import { ManifestJsonViewer } from './components/ManifestJsonViewer/ManifestJsonViewer';
import './CharacterViewer.css';

type ActiveTab = 'parts' | 'gear' | 'json';

export default function CharacterViewer() {
  const toast = useToast();

  const {
    loading,
    manifest,
    items,
    isSaving,
    partOverrides,
    skeletonUrl,
    currentUpdatedManifest,
    handlePartValueChange,
    stepPartValue,
    resetPartToInitial,
    resetAllOverrides,
    handleSaveChanges,
  } = useCharacterManifest();

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

  // Gear testing socket
  const [selectedGear, setSelectedGear] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('parts');

  // Convert selectedGear to descriptors
  const gearDescriptors = useMemo(() => {
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

  const partsCount = manifest ? Object.keys(manifest.parts).length : 0;

  const handleResetAll = () => {
    resetAllOverrides();
    setHiddenParts([]);
    setHighlightedPart(null);
    setSelectedGear({});
    setScale(1.0);
    setSpeedMultiplier(1.0);
    setAnimState('idle');
    setIsFlipped(false);
    toast.info('Viewer reset to defaults');
  };

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
            onClick={handleResetAll}
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

            {/* Viewport Controls Component */}
            <ViewportControls
              animState={animState}
              setAnimState={setAnimState}
              speedMultiplier={speedMultiplier}
              setSpeedMultiplier={setSpeedMultiplier}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              isFlipped={isFlipped}
              setIsFlipped={setIsFlipped}
              scale={scale}
              setScale={setScale}
              rootOffsetY={rootOffsetY}
              setRootOffsetY={setRootOffsetY}
              showJoints={showJoints}
              setShowJoints={setShowJoints}
              showBones={showBones}
              setShowBones={setShowBones}
              showBbox={showBbox}
              setShowBbox={setShowBbox}
            />
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
              Adjust Parts & Pivots ({partsCount})
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
            <PartsTuningPanel
              manifest={manifest}
              partOverrides={partOverrides}
              hiddenParts={hiddenParts}
              highlightedPart={highlightedPart}
              setHiddenParts={setHiddenParts}
              setHighlightedPart={setHighlightedPart}
              onResetPart={resetPartToInitial}
              onChangePartValue={handlePartValueChange}
              onStepPartValue={stepPartValue}
            />
          )}

          {/* TAB 2: Gear Socket Tester */}
          {activeTab === 'gear' && (
            <GearSocketTester
              items={items}
              selectedGear={selectedGear}
              setSelectedGear={setSelectedGear}
              activeGearCount={gearDescriptors.length}
            />
          )}

          {/* TAB 3: Raw Live JSON Manifest */}
          {activeTab === 'json' && (
            <ManifestJsonViewer manifest={currentUpdatedManifest} />
          )}
        </div>
      </div>
    </div>
  );
}
