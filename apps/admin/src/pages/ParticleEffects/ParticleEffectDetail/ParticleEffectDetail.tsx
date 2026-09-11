import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import ParticleCanvas from '../../../components/ParticleCanvas/ParticleCanvas';
import type { ParticleEffectConfig, ParticleEffect } from '@mine-me/shared';
import { convertPixiParticlesConfig } from '@mine-me/shared';
import './ParticleEffectDetail.css';

const DEFAULT_CONFIG: ParticleEffectConfig = {
  emitterType: 'continuous',
  shape: 'flame',
  rate: 40,
  lifetime: { min: 0.35, max: 0.75 },
  speed: { min: 30, max: 80 },
  angle: { min: 260, max: 280 },
  gravity: { x: 0, y: -45 },
  friction: 0.98,
  scale: { start: 1.25, end: 0.15 },
  color: { start: '#fff6c2', end: '#ef4444' },
  alpha: { start: 0.95, end: 0.0 },
  blendMode: 'add',
  spawnRadius: 3,
  turbulence: 12,
};

const PRESETS: Record<string, { name: string; key: string; description: string; config: ParticleEffectConfig }> = {
  torch_flame: {
    name: 'Vibrant Torch Flame',
    key: 'torch_flame',
    description: 'Blazing incandescent flame with additive bloom, turbulence, and rising sparks',
    config: {
      emitterType: 'continuous',
      shape: 'flame',
      rate: 45,
      lifetime: { min: 0.35, max: 0.75 },
      speed: { min: 30, max: 80 },
      angle: { min: 260, max: 280 },
      gravity: { x: 0, y: -45 },
      friction: 0.98,
      scale: { start: 1.25, end: 0.15 },
      alpha: { start: 0.95, end: 0.0 },
      color: { start: '#fff6c2', end: '#ef4444' },
      blendMode: 'add',
      spawnRadius: 3,
      turbulence: 12,
    },
  },
  campfire_blaze: {
    name: 'Campfire Blaze',
    key: 'campfire_blaze',
    description: 'High volume roaring campfire flame with floating buoyant embers',
    config: {
      emitterType: 'continuous',
      shape: 'flame',
      rate: 65,
      lifetime: { min: 0.5, max: 1.1 },
      speed: { min: 40, max: 110 },
      angle: { min: 250, max: 290 },
      gravity: { x: 0, y: -60 },
      friction: 0.97,
      scale: { start: 2.0, end: 0.25 },
      color: { start: '#ffffff', end: '#ea580c' },
      alpha: { start: 0.95, end: 0.0 },
      blendMode: 'add',
      spawnRadius: 8,
      turbulence: 18,
    },
  },
  soul_fire: {
    name: 'Blue Soul Fire',
    key: 'soul_fire',
    description: 'Occult spectral cyan and cobalt blue torch flame',
    config: {
      emitterType: 'continuous',
      shape: 'flame',
      rate: 40,
      lifetime: { min: 0.4, max: 0.85 },
      speed: { min: 30, max: 75 },
      angle: { min: 260, max: 280 },
      gravity: { x: 0, y: -40 },
      friction: 0.98,
      scale: { start: 1.3, end: 0.2 },
      color: { start: '#e0f2fe', end: '#0284c7' },
      alpha: { start: 0.9, end: 0.0 },
      blendMode: 'add',
      spawnRadius: 4,
      turbulence: 14,
    },
  },
  toxic_flame: {
    name: 'Toxic Acid Flame',
    key: 'toxic_flame',
    description: 'Alchemical lime green and emerald poison fire',
    config: {
      emitterType: 'continuous',
      shape: 'flame',
      rate: 40,
      lifetime: { min: 0.4, max: 0.8 },
      speed: { min: 25, max: 70 },
      angle: { min: 260, max: 280 },
      gravity: { x: 0, y: -35 },
      friction: 0.98,
      scale: { start: 1.2, end: 0.2 },
      color: { start: '#ecfccb', end: '#16a34a' },
      alpha: { start: 0.85, end: 0.0 },
      blendMode: 'add',
      spawnRadius: 4,
      turbulence: 10,
    },
  },
  block_dirt_chip: {
    name: 'Block Dirt Chipping',
    key: 'block_dirt_chip',
    description: 'Delicate organic dirt crumbs chipping off where the pickaxe contacts the block',
    config: {
      emitterType: 'burst',
      shape: 'crumb',
      burstCount: 5,
      lifetime: { min: 0.22, max: 0.45 },
      speed: { min: 25, max: 65 },
      angle: { min: 210, max: 330 },
      gravity: { x: 0, y: 160 },
      friction: 0.95,
      scale: { start: 0.65, end: 0.15 },
      color: { start: '#9a5823', end: '#3f1d0b' },
      alpha: { start: 0.9, end: 0.0 },
      blendMode: 'normal',
      spawnRadius: 2,
    },
  },
  block_dirt_hit: {
    name: 'Block Dirt Hit',
    key: 'block_dirt_hit',
    description: 'Satisfying crumble of dirt crumbs when striking or breaking soil blocks',
    config: {
      emitterType: 'burst',
      shape: 'crumb',
      burstCount: 9,
      lifetime: { min: 0.3, max: 0.55 },
      speed: { min: 35, max: 85 },
      angle: { min: 190, max: 350 },
      gravity: { x: 0, y: 200 },
      friction: 0.95,
      scale: { start: 0.85, end: 0.2 },
      color: { start: '#9a5823', end: '#3f1d0b' },
      alpha: { start: 1.0, end: 0.0 },
      blendMode: 'normal',
      spawnRadius: 4,
    },
  },
  block_mineral_chip: {
    name: 'Mineral Vein Chipping',
    key: 'block_mineral_chip',
    description: 'Crisp sparkling mineral flecks chipping at cursor strike',
    config: {
      emitterType: 'burst',
      shape: 'spark',
      burstCount: 5,
      lifetime: { min: 0.2, max: 0.45 },
      speed: { min: 30, max: 75 },
      angle: { min: 0, max: 360 },
      gravity: { x: 0, y: 100 },
      friction: 0.96,
      scale: { start: 0.7, end: 0.15 },
      color: { start: '#7dd3fc', end: '#f59e0b' },
      alpha: { start: 1.0, end: 0.0 },
      blendMode: 'add',
      spawnRadius: 2,
    },
  },
  block_mineral_hit: {
    name: 'Mineral Vein Break',
    key: 'block_mineral_hit',
    description: 'Bright luminescent glint sparks when mining rare mineral veins',
    config: {
      emitterType: 'burst',
      shape: 'spark',
      burstCount: 12,
      lifetime: { min: 0.3, max: 0.65 },
      speed: { min: 50, max: 120 },
      angle: { min: 0, max: 360 },
      gravity: { x: 0, y: 140 },
      friction: 0.97,
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1.0, end: 0.0 },
      color: { start: '#38bdf8', end: '#f59e0b' },
      blendMode: 'add',
      spawnRadius: 5,
    },
  },
  enchanted_item_aura: {
    name: 'Enchanted Aura',
    key: 'enchanted_item_aura',
    description: 'Mystic ascending particles for high rarity items and relics',
    config: {
      emitterType: 'continuous',
      shape: 'spark',
      rate: 20,
      lifetime: { min: 0.6, max: 1.2 },
      speed: { min: 15, max: 40 },
      angle: { min: 0, max: 360 },
      gravity: { x: 0, y: -20 },
      friction: 0.99,
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 0.9, end: 0.0 },
      color: { start: '#c084fc', end: '#38bdf8' },
      blendMode: 'add',
      rotationSpeed: { min: -2, max: 2 },
      spawnRadius: 14,
    },
  },
};

export default function ParticleEffectDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify(DEFAULT_CONFIG, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importJsonInput, setImportJsonInput] = useState<string>('');
  const [importModalError, setImportModalError] = useState<string | null>(null);

  // Parse JSON config safely for the live preview
  const parsedConfig: ParticleEffectConfig = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError(null);
      return parsed;
    } catch (err: any) {
      setJsonError(err.message);
      return DEFAULT_CONFIG;
    }
  }, [jsonText]);

  const handleImportPixiConfig = () => {
    try {
      const parsed = JSON.parse(importJsonInput);
      const converted = convertPixiParticlesConfig(parsed);
      setJsonText(JSON.stringify(converted, null, 2));
      setShowImportModal(false);
      setImportJsonInput('');
      setImportModalError(null);
      toast.success('Successfully imported & converted PixiParticles configuration!');
    } catch (err: any) {
      setImportModalError(err.message || 'Failed to parse or convert Pixi configuration.');
    }
  };

  const handleUpdateOffset = (axis: 'x' | 'y', val: number) => {
    try {
      const current = JSON.parse(jsonText);
      const currentOffset = current.offset || { x: 0, y: 0 };
      const updatedOffset = { ...currentOffset, [axis]: val };
      current.offset = updatedOffset;
      setJsonText(JSON.stringify(current, null, 2));
    } catch {
      // ignore if invalid json
    }
  };

  useEffect(() => {
    if (isNew) return;

    setLoading(true);
    fetchWithAuth(`/api/admin/particle-effects/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch particle effect');
        return res.json();
      })
      .then((data: ParticleEffect) => {
        setName(data.name || '');
        setDescription(data.description || '');
        setJsonText(JSON.stringify(data.config || DEFAULT_CONFIG, null, 2));
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err.message || 'Error loading effect');
        setLoading(false);
      });
  }, [id, isNew]);

  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    if (isNew) {
      setName(preset.name);
      setDescription(preset.description);
    }
    setJsonText(JSON.stringify(preset.config, null, 2));
    toast.success(`Loaded "${preset.name}" preset!`);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      toast.success('JSON formatted');
    } catch (err: any) {
      setJsonError(err.message);
      toast.error('Invalid JSON: ' + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    let configToSave: ParticleEffectConfig;
    try {
      configToSave = JSON.parse(jsonText);
    } catch (err: any) {
      toast.error('Invalid JSON configuration: ' + err.message);
      return;
    }

    const effectType = configToSave.emitterType === 'burst' ? 'BURST' : 'CONTINUOUS';

    setSaving(true);
    try {
      const url = isNew
        ? '/api/admin/particle-effects'
        : `/api/admin/particle-effects/${id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: effectType,
          description: description.trim() || null,
          config: configToSave,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save particle effect');
      }

      const savedData = await res.json();
      toast.success(isNew ? 'Particle effect created!' : 'Particle effect updated!');

      if (isNew) {
        navigate(`/particle-effects/${savedData.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving particle effect');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this particle effect?')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/particle-effects/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete particle effect');
      }

      toast.success('Particle effect deleted');
      navigate('/particle-effects');
    } catch (err: any) {
      toast.error(err.message || 'Error deleting particle effect');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner size={60} />
      </div>
    );
  }

  return (
    <div className="space-y-6 particle-detail-container pb-12">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <button
            onClick={() => navigate('/particle-effects')}
            className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-1 inline-flex items-center gap-1"
          >
            ← Back to Particle Effects
          </button>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">
            {isNew ? 'NEW PARTICLE EFFECT' : name || 'PARTICLE EFFECT DETAIL'}
          </h2>
          <p className="text-slate-500 font-medium">
            {isNew
              ? 'Define a new particle effect and visually inspect it in real time.'
              : `ID: ${id} • Type: ${parsedConfig.emitterType || 'continuous'}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer px-4 py-2 border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold rounded shadow-xs transition-all disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer px-5 py-2 bg-slate-900 text-white font-bold rounded shadow hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <LoadingSpinner size={16} color="inherit" />}
            <span>{saving ? 'Saving...' : isNew ? 'Create Effect' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form & JSON Config */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              General Info
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Torch Flame"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-800"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional description of when or where this effect plays."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Preset Selector & JSON Config */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                JSON Configuration
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="cursor-pointer px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded transition-colors flex items-center gap-1"
                  title="Import from community PixiParticles editor JSON"
                >
                  <span>📥 Import PixiParticles JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleFormatJson}
                  className="cursor-pointer px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                  title="Format JSON indentation"
                >
                  Format JSON
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="block text-xs font-semibold text-slate-500 mb-1.5">
                Load Preset Template:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRESETS).map(([pKey, p]) => (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => handleApplyPreset(pKey)}
                    className="cursor-pointer px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors border border-slate-200"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Offset Quick Tweak */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Emitter Positional Offset (px)
                </span>
                <span className="text-[11px] text-slate-400">
                  Aligns flame to torch sconces or tile anchor
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-0.5">
                    Offset X (horizontal)
                  </label>
                  <input
                    type="number"
                    value={parsedConfig.offset?.x ?? 0}
                    onChange={(e) => handleUpdateOffset('x', parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-0.5">
                    Offset Y (vertical)
                  </label>
                  <input
                    type="number"
                    value={parsedConfig.offset?.y ?? 0}
                    onChange={(e) => handleUpdateOffset('y', parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* JSON Code Input */}
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={16}
                spellCheck={false}
                className={`particle-json-textarea w-full p-3 bg-slate-950 text-emerald-400 rounded-lg border focus:outline-none ${
                  jsonError ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {jsonError ? (
                <div className="mt-1.5 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 font-mono">
                  Syntax Error: {jsonError}
                </div>
              ) : (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>✓ Valid JSON config loaded in preview canvas</span>
                  <span>
                    Emitter: {parsedConfig.emitterType || 'burst'} | Shape: {parsedConfig.shape || 'circle'} | Blend: {parsedConfig.blendMode || 'normal'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Particle Canvas */}
        <div className="lg:col-span-6 space-y-3 sticky top-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Live Viewport Preview
                </h3>
                <span className="text-xs text-slate-400">
                  Click or drag in the viewport to trigger particles
                </span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded">
                PixiJS v8
              </span>
            </div>

            <ParticleCanvas
              config={parsedConfig}
              width={480}
              height={400}
              className="w-full max-w-[480px]"
            />
          </div>

          <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="font-bold text-slate-800 flex items-center justify-between">
              <span>💡 Prebuilt & Community Effects</span>
              <a
                href="https://particle-emitter.pixijs.io/"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline font-semibold"
              >
                PixiParticles Web Editor ↗
              </a>
            </div>
            <p>
              You can export JSON from the official Pixi Web Particle Editor or community presets and paste it using the{' '}
              <strong className="text-slate-800">"Import PixiParticles JSON"</strong> button above.
            </p>
            <p>
              When authoring custom configs, supported shapes include{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">'flame'</code>,{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">'spark'</code>,{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">'circle'</code>,{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">'pixel'</code>, and{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">'smoke'</code>. Set{' '}
              <code className="font-mono text-slate-700 bg-slate-200 px-1 rounded">blendMode: 'add'</code> for glowing luminous fire bloom!
            </p>
          </div>
        </div>
      </div>

      {/* PixiParticles JSON Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Import PixiParticles / Community JSON
                </h3>
                <p className="text-xs text-slate-500">
                  Paste JSON exported from particle-emitter.pixijs.io or legacy CloudKid emitter
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportModalError(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <textarea
                value={importJsonInput}
                onChange={(e) => setImportJsonInput(e.target.value)}
                placeholder={'{\n  "alpha": { "start": 0.8, "end": 0.1 },\n  "color": { "start": "ffffff", "end": "ff0000" },\n  "speed": { "start": 60, "end": 20 },\n  "blendMode": "add"\n}'}
                rows={10}
                className="w-full p-3 font-mono text-xs bg-slate-950 text-emerald-300 rounded-lg border border-slate-800 focus:outline-none"
              />
            </div>

            {importModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
                {importModalError}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="https://particle-emitter.pixijs.io/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Open PixiParticles Web Emitter Editor ↗
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportModalError(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportPixiConfig}
                  className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-bold hover:bg-emerald-700 cursor-pointer shadow-xs"
                >
                  Convert & Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
