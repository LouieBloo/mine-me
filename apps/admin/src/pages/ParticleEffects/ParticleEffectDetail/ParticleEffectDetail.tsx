import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import ParticleCanvas from '../../../components/ParticleCanvas/ParticleCanvas';
import type { ParticleEffectConfig, ParticleEffect } from '@mine-me/shared';
import './ParticleEffectDetail.css';

const DEFAULT_CONFIG: ParticleEffectConfig = {
  emitterType: 'continuous',
  shape: 'circle',
  rate: 25,
  lifetime: { min: 0.4, max: 0.8 },
  speed: { min: 20, max: 50 },
  angle: { min: -105, max: -75 },
  gravity: { x: 0, y: -20 },
  scale: { start: 1.0, end: 0.1 },
  alpha: { start: 0.9, end: 0.0 },
  color: { start: '#ffaa00', end: '#ff2200' },
  spawnRadius: 4,
};

const PRESETS: Record<string, { name: string; key: string; description: string; config: ParticleEffectConfig }> = {
  torch_flame: {
    name: 'Torch Flame',
    key: 'torch_flame',
    description: 'Continuous rising fire embers for torches and campfires',
    config: {
      emitterType: 'continuous',
      shape: 'circle',
      rate: 30,
      lifetime: { min: 0.4, max: 0.9 },
      speed: { min: 25, max: 60 },
      angle: { min: -105, max: -75 },
      gravity: { x: 0, y: -30 },
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 1.0, end: 0.0 },
      color: { start: '#ffcc00', end: '#ff2200' },
      spawnRadius: 4,
    },
  },
  block_dirt_hit: {
    name: 'Block Dirt Hit',
    key: 'block_dirt_hit',
    description: 'Instant dirt debris burst when striking dirt blocks',
    config: {
      emitterType: 'burst',
      shape: 'pixel',
      burstCount: 14,
      lifetime: { min: 0.3, max: 0.6 },
      speed: { min: 60, max: 150 },
      angle: { min: -150, max: -30 },
      gravity: { x: 0, y: 350 },
      friction: 0.96,
      scale: { start: 1.0, end: 0.4 },
      alpha: { start: 1.0, end: 0.2 },
      color: { start: '#8b5a2b', end: '#4a2f13' },
      rotationSpeed: { min: -5, max: 5 },
      spawnWidth: 16,
      spawnHeight: 16,
    },
  },
  block_mineral_hit: {
    name: 'Mineral Vein Hit',
    key: 'block_mineral_hit',
    description: 'Bright glint sparks when mining rare mineral veins',
    config: {
      emitterType: 'burst',
      shape: 'spark',
      burstCount: 12,
      lifetime: { min: 0.4, max: 0.8 },
      speed: { min: 80, max: 200 },
      angle: { min: 0, max: 360 },
      gravity: { x: 0, y: 150 },
      friction: 0.94,
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 1.0, end: 0.0 },
      color: { start: '#38bdf8', end: '#818cf8' },
      rotationSpeed: { min: -8, max: 8 },
      spawnRadius: 8,
    },
  },
  enchanted_item_aura: {
    name: 'Enchanted Aura',
    key: 'enchanted_item_aura',
    description: 'Mystic ascending particles for high rarity items and relics',
    config: {
      emitterType: 'continuous',
      shape: 'spark',
      rate: 15,
      lifetime: { min: 0.8, max: 1.5 },
      speed: { min: 15, max: 40 },
      angle: { min: -100, max: -80 },
      gravity: { x: 0, y: -10 },
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 0.8, end: 0.0 },
      color: { start: '#c084fc', end: '#38bdf8' },
      rotationSpeed: { min: -2, max: 2 },
      spawnRadius: 16,
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
                  <span>Emitter: {parsedConfig.emitterType || 'burst'} | Shape: {parsedConfig.shape || 'circle'}</span>
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

          <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800">💡 LLM Prompting Tip</div>
            <p>
              To create new effects with an LLM, prompt it to produce a JSON adhering to{' '}
              <code className="font-mono font-bold text-slate-700">ParticleEffectConfig</code>{' '}
              with properties: <code className="font-mono text-slate-700">emitterType</code> ('continuous'|'burst'),{' '}
              <code className="font-mono text-slate-700">shape</code> ('circle'|'pixel'|'spark'|'smoke'),{' '}
              <code className="font-mono text-slate-700">color</code> ({'{ start, end }'}),{' '}
              <code className="font-mono text-slate-700">speed</code>,{' '}
              <code className="font-mono text-slate-700">angle</code>,{' '}
              <code className="font-mono text-slate-700">gravity</code>, and{' '}
              <code className="font-mono text-slate-700">lifetime</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
