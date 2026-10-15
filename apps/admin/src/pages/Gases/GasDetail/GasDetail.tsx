import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_GAS_APPEARANCE, GAS_APPEARANCE_LIMITS, resolveGasAppearance, validateGas,
  type GasAppearance, type GasDefinition, type GasGeneration, type Flammability,
} from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import FlammabilityPanel from '../../../components/FlammabilityPanel/FlammabilityPanel';
import GasPreview from '../../../components/GasPreview/GasPreview';
import GasGenerationPanel from './GasGenerationPanel/GasGenerationPanel';
import GasSoundEffects from './GasSoundEffects/GasSoundEffects';
import './GasDetail.css';

interface GasForm {
  typeKey: string;
  name: string;
  description: string;
  color: string;
  opacity: number;
  density: number;
  diffusionRate: number;
  minConcentration: number;
  ventLifetime: number;
  appearance: GasAppearance;
  flammability: Flammability | null;
  generation: GasGeneration | null;
}

/** What a brand new gas starts as: a plain, harmless gas about as heavy as air that does not burn. */
export const NEW_GAS: GasForm = {
  typeKey: '',
  name: '',
  description: '',
  color: '#9db7cc',
  opacity: 0.35,
  density: 1,
  diffusionRate: 0.25,
  minConcentration: 0.02,
  ventLifetime: 6,
  appearance: { ...DEFAULT_GAS_APPEARANCE },
  flammability: null,
  generation: null,
};

const inputClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

interface NumberSetting {
  key: 'density' | 'diffusionRate' | 'minConcentration' | 'ventLifetime';
  label: string;
  hint: string;
  min: number;
  max?: number;
  step: number;
}

const PHYSICS: NumberSetting[] = [
  { key: 'density', label: 'Density', hint: 'Compared with air (1). Lighter gases rise and leave the mine, heavier ones sink and pool on the floor. Hydrogen is about 0.07', min: 0.01, step: 0.05 },
  { key: 'diffusionRate', label: 'Spread Rate', hint: 'How quickly it spreads into neighbouring space each step, above 0 up to 1', min: 0.01, max: 1, step: 0.05 },
  { key: 'minConcentration', label: 'Minimum Concentration', hint: 'A cell holding less than this is dropped. Higher clears thin traces sooner; lower lets gas thin out further', min: 0, max: 1, step: 0.01 },
  { key: 'ventLifetime', label: 'Open-Air Lifetime (s)', hint: 'Gas in the open air (a cell with clear sky above it) keeps rising but fades away over about this long', min: 0.5, step: 0.5 },
];

interface AppearanceSetting {
  key: keyof GasAppearance;
  label: string;
  hint: string;
  step: number;
}

const LOOK: AppearanceSetting[] = [
  { key: 'softness', label: 'Softness', hint: 'How blurred the edge of a cloud is, 0 (hard squares) to 1 (very soft)', step: 0.05 },
  { key: 'driftSpeed', label: 'Drift Speed', hint: 'How fast the cloud swirls, in cycles per second', step: 0.05 },
  { key: 'driftAmount', label: 'Drift Amount', hint: 'How far the swirl moves things, as a fraction of a block', step: 0.01 },
];

const show = (n: number): number | '' => (Number.isFinite(n) ? n : '');

export default function GasDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { fetchWithAuth } = useApi();
  const toast = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [gas, setGas] = useState<GasDefinition | null>(null);
  const [form, setForm] = useState<GasForm>(NEW_GAS);
  const [problems, setProblems] = useState<string[]>([]);
  const [particleEffects, setParticleEffects] = useState<Array<{ id: string; name: string }>>([]);

  // The particle library the flame effect is picked from; the gas can be edited without it
  useEffect(() => {
    fetchWithAuth('/api/admin/particle-effects')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setParticleEffects(Array.isArray(list) ? list : []))
      .catch(() => setParticleEffects([]));
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/gases/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch gas');
        const data: GasDefinition = await res.json();
        setGas(data);
        setForm({
          typeKey: data.typeKey,
          name: data.name,
          description: data.description ?? '',
          color: data.color,
          opacity: data.opacity,
          density: data.density,
          diffusionRate: data.diffusionRate,
          minConcentration: data.minConcentration,
          ventLifetime: data.ventLifetime,
          appearance: resolveGasAppearance(data.appearance),
          flammability: data.flammability ?? null,
          generation: data.generation ?? null,
        });
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof GasForm>(key: K, value: GasForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  const setLook = (key: keyof GasAppearance, value: number) => {
    setForm((prev) => ({ ...prev, appearance: { ...prev.appearance, [key]: value } }));
    setProblems([]);
  };

  const preview = useMemo(
    () => ({
      appearance: resolveGasAppearance(form.appearance),
      color: /^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#000000',
      opacity: Number.isFinite(form.opacity) ? Math.min(1, Math.max(0, form.opacity)) : 1,
      density: Number.isFinite(form.density) && form.density > 0 ? form.density : 1,
      diffusionRate: Number.isFinite(form.diffusionRate) && form.diffusionRate > 0 ? Math.min(1, form.diffusionRate) : 0.25,
      minConcentration: Number.isFinite(form.minConcentration) ? Math.min(1, Math.max(0, form.minConcentration)) : 0.02,
      ventLifetime: Number.isFinite(form.ventLifetime) && form.ventLifetime > 0 ? form.ventLifetime : 6,
    }),
    [form.color, form.opacity, form.appearance, form.density, form.diffusionRate, form.minConcentration, form.ventLifetime]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, name: form.name.trim(), description: form.description.trim() || null };
    const errors = validateGas(body);
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/gases' : `/api/admin/gases/${gas!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} gas`);
      }
      const saved: GasDefinition = await res.json();
      toast.success(isNew ? 'Gas created!' : 'Gas saved!');
      setProblems([]);
      if (isNew) {
        navigate(`/gases/${saved.id}`, { replace: true });
      } else {
        setGas(saved);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!gas) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/gases/${gas.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete gas');
      }
      toast.success(`${gas.name} deleted`);
      navigate('/gases');
    } catch (err: any) {
      toast.error(err.message);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <LoadingSpinner size={60} />
      </div>
    );
  }

  if (notFound || (!isNew && !gas)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Gas not found</h3>
        <button onClick={() => navigate('/gases')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Gases
        </button>
      </div>
    );
  }

  return (
    <div className="gas-detail-page max-w-6xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/gases')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Gases
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Gas' : gas!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{gas!.typeKey}</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Delete Gas
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSave} noValidate className="lg:col-span-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 p-6">
            <h3 className="text-xl font-black text-white tracking-tight uppercase">Gas Properties</h3>
            <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">How it looks, spreads, burns and appears in the mines</p>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="typeKey" className={labelClass}>Key</label>
                <input
                  id="typeKey"
                  type="text"
                  value={form.typeKey}
                  disabled={!isNew}
                  placeholder="e.g. METHANE"
                  onChange={(e) => set('typeKey', e.target.value.toUpperCase())}
                  className={`${inputClass} font-mono disabled:opacity-60 disabled:cursor-not-allowed`}
                />
                <span className="text-[11px] text-slate-400 font-medium">
                  {isNew ? 'Capital letters, digits and underscores. It cannot be changed later.' : 'The key cannot be changed once a gas exists.'}
                </span>
              </div>
              <div className="space-y-2">
                <label htmlFor="name" className={labelClass}>Name</label>
                <input id="name" type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className={labelClass}>Description</label>
              <textarea id="description" value={form.description} rows={2} onChange={(e) => set('description', e.target.value)} className={`${inputClass} resize-none`} />
            </div>

            <section className="space-y-4">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Appearance</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="color" className={labelClass}>Colour</label>
                  <div className="flex gap-3">
                    <input
                      id="color-picker"
                      aria-label="Colour picker"
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#000000'}
                      onChange={(e) => set('color', e.target.value)}
                      className="h-12 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    />
                    <input id="color" type="text" value={form.color} onChange={(e) => set('color', e.target.value)} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="opacity" className={labelClass}>Opacity</label>
                  <input id="opacity" type="number" min={0} max={1} step={0.05} value={show(form.opacity)} onChange={(e) => set('opacity', e.target.value === '' ? NaN : Number(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-slate-400 font-medium">How solid it looks at full concentration; thinner gas is fainter</span>
                </div>
                {LOOK.map((setting) => (
                  <div key={setting.key} className="space-y-2">
                    <label htmlFor={setting.key} className={labelClass}>{setting.label}</label>
                    <input
                      id={setting.key}
                      type="number"
                      min={GAS_APPEARANCE_LIMITS[setting.key].min}
                      max={GAS_APPEARANCE_LIMITS[setting.key].max}
                      step={setting.step}
                      value={show(form.appearance[setting.key])}
                      onChange={(e) => setLook(setting.key, e.target.value === '' ? NaN : Number(e.target.value))}
                      className={inputClass}
                    />
                    <span className="text-[11px] text-slate-400 font-medium">{setting.hint}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Behaviour</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {PHYSICS.map((setting) => (
                  <div key={setting.key} className="space-y-2">
                    <label htmlFor={setting.key} className={labelClass}>{setting.label}</label>
                    <input
                      id={setting.key}
                      type="number"
                      min={setting.min}
                      max={setting.max}
                      step={setting.step}
                      value={show(form[setting.key])}
                      onChange={(e) => set(setting.key, e.target.value === '' ? NaN : Number(e.target.value))}
                      className={inputClass}
                    />
                    <span className="text-[11px] text-slate-400 font-medium">{setting.hint}</span>
                  </div>
                ))}
              </div>
            </section>

            <FlammabilityPanel value={form.flammability} onChange={(v) => set('flammability', v)} particleEffects={particleEffects} allowExplosion />
            <GasGenerationPanel value={form.generation} onChange={(v) => set('generation', v)} />

            {problems.length > 0 && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
                <p className="font-black uppercase text-xs tracking-wider mb-2">Please fix:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <LoadingSpinner size={20} color="inherit" />
                  <span>Saving...</span>
                </>
              ) : isNew ? (
                'Create Gas'
              ) : (
                'Save Gas'
              )}
            </button>
          </div>
        </form>

        <div className="space-y-8">
          <div className="lg:sticky lg:top-6 space-y-8">
            <GasPreview gas={preview} />
            {isNew ? (
              <p className="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Save the gas first, then you can give it sounds.
              </p>
            ) : (
              <GasSoundEffects gas={gas!} onSaved={(saved) => setGas((prev) => (prev ? { ...prev, soundEffects: saved.soundEffects } : saved))} />
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Gas?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{gas?.name}</strong>? Mines that are already running keep it, but new mines will no longer have it. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" disabled={deleting} onClick={() => setConfirmingDelete(false)} className="cursor-pointer px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={deleting} onClick={handleDelete} className="cursor-pointer px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg disabled:opacity-50 flex items-center gap-2">
              {deleting && <LoadingSpinner size={16} color="inherit" />}
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
