import React from 'react';
import type { SkeletonManifest } from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import type { PartOverride, PartOverridesMap } from '../../hooks/useCharacterManifest';
import { PartCard } from './PartCard/PartCard';
import './PartsTuningPanel.css';

export interface PartsTuningPanelProps {
  manifest: SkeletonManifest | null;
  partOverrides: PartOverridesMap;
  hiddenParts: string[];
  highlightedPart: string | null;
  setHiddenParts: React.Dispatch<React.SetStateAction<string[]>>;
  setHighlightedPart: (part: string | null) => void;
  onResetPart: (partName: string) => void;
  onChangePartValue: (partName: string, field: keyof PartOverride, value: number) => void;
  onStepPartValue: (partName: string, field: keyof PartOverride, delta: number, isFloat?: boolean) => void;
}

export const PartsTuningPanel: React.FC<PartsTuningPanelProps> = ({
  manifest,
  partOverrides,
  hiddenParts,
  highlightedPart,
  setHiddenParts,
  setHighlightedPart,
  onResetPart,
  onChangePartValue,
  onStepPartValue,
}) => {
  const partsList = manifest ? Object.entries(manifest.parts) : [];

  const togglePartVisibility = (partName: string) => {
    setHiddenParts((prev) =>
      prev.includes(partName) ? prev.filter((p) => p !== partName) : [...prev, partName]
    );
  };

  return (
    <div className="parts-tuning-panel space-y-4 animate-in fade-in">
      <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between text-xs text-blue-900">
        <span>
          💡 <strong>Tip:</strong> Use the <strong>+ / - buttons</strong> or type values to adjust dimensions, pelvis offsets (X/Y), and pivot anchors live. Click <strong>💾 Save Rig Coordinates</strong> above when satisfied.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {partsList.map(([partName, partDef]) => {
          const isHidden = hiddenParts.includes(partName);
          const isHighlighted = highlightedPart === partName;
          const currentValues = partOverrides[partName] || {
            width: partDef.width,
            height: partDef.height,
            offsetX: partDef.offset_from_pelvis[0],
            offsetY: partDef.offset_from_pelvis[1],
            pivotX: partDef.pivot_anchor[0],
            pivotY: partDef.pivot_anchor[1],
          };

          return (
            <PartCard
              key={partName}
              partName={partName}
              partDef={partDef}
              currentValues={currentValues}
              isHidden={isHidden}
              isHighlighted={isHighlighted}
              onReset={() => onResetPart(partName)}
              onToggleHighlight={() => setHighlightedPart(isHighlighted ? null : partName)}
              onToggleVisibility={() => togglePartVisibility(partName)}
              onChangeValue={(field, value) => onChangePartValue(partName, field, value)}
              onStepValue={(field, delta, isFloat) => onStepPartValue(partName, field, delta, isFloat)}
            />
          );
        })}
      </div>
    </div>
  );
};
