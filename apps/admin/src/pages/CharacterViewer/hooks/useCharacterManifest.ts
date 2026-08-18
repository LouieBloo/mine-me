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

export type HandJointOverride = {
  offsetX: number;
  offsetY: number;
};

export type ToolSocketOverride = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
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
  const [handJointOverride, setHandJointOverride] = useState<HandJointOverride>({
    offsetX: 210,
    offsetY: 100,
  });
  const [toolSocketOverride, setToolSocketOverride] = useState<ToolSocketOverride>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
  });

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

        // Initialize handJointOverride
        if (manifestData?.hand_joint) {
          setHandJointOverride({
            offsetX: manifestData.hand_joint.offset[0] ?? 210,
            offsetY: manifestData.hand_joint.offset[1] ?? 100,
          });
        }

        // Initialize toolSocketOverride
        if (manifestData?.tool_socket) {
          setToolSocketOverride({
            offsetX: manifestData.tool_socket.offset[0] ?? 0,
            offsetY: manifestData.tool_socket.offset[1] ?? 0,
            scale: manifestData.tool_socket.scale ?? 1,
            rotation: manifestData.tool_socket.rotation ?? 0,
          });
        }

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

  // Handle hand joint changes
  const handleHandJointChange = (field: keyof HandJointOverride, value: number) => {
    setHandJointOverride((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const stepHandJointValue = (field: keyof HandJointOverride, delta: number) => {
    setHandJointOverride((prev) => ({
      ...prev,
      [field]: Math.round(prev[field] + delta),
    }));
  };

  const resetHandJointToInitial = () => {
    if (initialManifest?.hand_joint) {
      setHandJointOverride({
        offsetX: initialManifest.hand_joint.offset[0] ?? 210,
        offsetY: initialManifest.hand_joint.offset[1] ?? 100,
      });
    } else {
      setHandJointOverride({
        offsetX: 210,
        offsetY: 100,
      });
    }
    toast.info('Reset hand joint to saved defaults');
  };

  // Handle tool socket changes
  const handleToolSocketChange = (field: keyof ToolSocketOverride, value: number) => {
    setToolSocketOverride((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const stepToolSocketValue = (
    field: keyof ToolSocketOverride,
    delta: number,
    isFloat = false
  ) => {
    setToolSocketOverride((prev) => {
      const currentVal = prev[field];
      const newVal = isFloat
        ? Math.round((currentVal + delta) * 100) / 100
        : Math.round(currentVal + delta);
      return {
        ...prev,
        [field]: newVal,
      };
    });
  };

  const resetToolSocketToInitial = () => {
    if (initialManifest?.tool_socket) {
      setToolSocketOverride({
        offsetX: initialManifest.tool_socket.offset[0] ?? 0,
        offsetY: initialManifest.tool_socket.offset[1] ?? 0,
        scale: initialManifest.tool_socket.scale ?? 1,
        rotation: initialManifest.tool_socket.rotation ?? 0,
      });
    } else {
      setToolSocketOverride({
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotation: 0,
      });
    }
    toast.info('Reset weapon tool socket to saved defaults');
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
    resetHandJointToInitial();
    resetToolSocketToInitial();
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
    if (handJointOverride) {
      updated.hand_joint = {
        offset: [handJointOverride.offsetX, handJointOverride.offsetY],
      };
    }
    if (toolSocketOverride) {
      updated.tool_socket = {
        offset: [toolSocketOverride.offsetX, toolSocketOverride.offsetY],
        scale: toolSocketOverride.scale,
        rotation: toolSocketOverride.rotation,
      };
    }
    return updated;
  }, [manifest, partOverrides, handJointOverride, toolSocketOverride]);

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
    handJointOverride,
    toolSocketOverride,
    skeletonUrl,
    currentUpdatedManifest,
    handlePartValueChange,
    stepPartValue,
    handleHandJointChange,
    stepHandJointValue,
    resetHandJointToInitial,
    handleToolSocketChange,
    stepToolSocketValue,
    resetToolSocketToInitial,
    resetPartToInitial,
    resetAllOverrides,
    handleSaveChanges,
  };
}
