import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useApi } from '../../../hooks/useApi';
import type { SkeletonManifest } from '../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import { getAssetUrl, MINER_SKELETON_PATH } from '@mine-me/shared';

export type PartOverride = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pivotX: number;
  pivotY: number;
};

export type PartOverridesMap = Record<string, PartOverride>;

export function useCharacterManifest() {
  const toast = useToast();
  const { fetchWithAuth } = useApi();

  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<SkeletonManifest | null>(null);
  const [initialManifest, setInitialManifest] = useState<SkeletonManifest | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [partOverrides, setPartOverrides] = useState<PartOverridesMap>({});

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
        const initialOverrides: PartOverridesMap = {};
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
    field: keyof PartOverride,
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
    field: keyof PartOverride,
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

  // Reset all overrides to initial manifest
  const resetAllOverrides = () => {
    if (initialManifest?.parts) {
      const initOv: PartOverridesMap = {};
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
  };

  // Build current manifest snapshot with overrides applied
  const currentUpdatedManifest = useMemo(() => {
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

  return {
    loading,
    manifest,
    initialManifest,
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
  };
}
