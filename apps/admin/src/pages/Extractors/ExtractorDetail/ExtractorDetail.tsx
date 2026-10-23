import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_EXTRACTOR, validateExtractor, type ExtractorDefinition } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import ExtractorPreview from '../../../components/ExtractorPreview/ExtractorPreview';
import ExtractorSoundEffects from './ExtractorSoundEffects/ExtractorSoundEffects';
import ExtractorArt from './ExtractorArt/ExtractorArt';
import './ExtractorDetail.css';

type NumberKey =
  | 'width' | 'height' | 'entranceOffset' | 'landingSeconds' | 'shaftWidth' | 'buildSecondsPerSegment' | 'beltSpeed'
  | 'beltItemSpacing' | 'depositItemsPerSecond' | 'unloadItemsPerSecond' | 'beltSegmentHealth' | 'health';

interface ExtractorForm extends Record<NumberKey, number> {
  key: string;
  name: string;
  description: string;
  landingParticleEffectId: string;
  isDefault: boolean;
}

/** What a brand new extractor starts as: the built-in one. */
export const NEW_EXTRACTOR: ExtractorForm = {
  key: '',
  name: '',
  description: '',
  width: DEFAULT_EXTRACTOR.width,
  height: DEFAULT_EXTRACTOR.height,
  entranceOffset: DEFAULT_EXTRACTOR.entranceOffset,
  landingSeconds: DEFAULT_EXTRACTOR.landingSeconds,
  shaftWidth: DEFAULT_EXTRACTOR.shaftWidth,
  buildSecondsPerSegment: DEFAULT_EXTRACTOR.buildSecondsPerSegment,
  beltSpeed: DEFAULT_EXTRACTOR.beltSpeed,
  beltItemSpacing: DEFAULT_EXTRACTOR.beltItemSpacing,
  depositItemsPerSecond: DEFAULT_EXTRACTOR.depositItemsPerSecond,
  unloadItemsPerSecond: DEFAULT_EXTRACTOR.unloadItemsPerSecond,
  beltSegmentHealth: DEFAULT_EXTRACTOR.beltSegmentHealth,
  health: DEFAULT_EXTRACTOR.health,
  landingParticleEffectId: '',
  isDefault: false,
};

const inputClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';

interface Setting {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  step: number;
}

const GROUPS: { title: string; settings: Setting[] }[] = [
  {
    title: 'Machine',
    settings: [
      { key: 'width', label: 'Width (blocks)', hint: 'Footprint across, standing on the ground', min: 1, step: 1 },
      { key: 'height', label: 'Height (blocks)', hint: 'Footprint up from the ground', min: 1, step: 1 },
      { key: 'entranceOffset', label: 'Distance From Exit', hint: 'Blocks from the exit to the middle of the machine. Negative puts it on the left; it never covers the exit', min: -200, step: 1 },
      { key: 'landingSeconds', label: 'Landing Time (s)', hint: 'How long the fly-in takes at the start of a run', min: 0.1, step: 0.5 },
      { key: 'health', label: 'Health', hint: 'Reserved: the extractor itself cannot be damaged yet', min: 1, step: 10 },
    ],
  },
  {
    title: 'Belt',
    settings: [
      { key: 'shaftWidth', label: 'Shaft Width (blocks)', hint: 'How wide the belt digs, centred under the machine', min: 1, step: 1 },
      { key: 'buildSecondsPerSegment', label: 'Build Time (s / segment)', hint: 'Seconds to dig and lay one row. Upgrades make this smaller', min: 0.1, step: 0.1 },
      { key: 'beltSpeed', label: 'Belt Speed (blocks / s)', hint: 'How fast items ride up to the extractor', min: 0.1, step: 0.5 },
      { key: 'beltItemSpacing', label: 'Item Spacing (blocks)', hint: 'The least gap between two items. A spot with an item this close refuses another, so a full belt backs up', min: 0.1, step: 0.1 },
      { key: 'beltSegmentHealth', label: 'Segment Health', hint: 'Hit points of one belt segment. At 0 it breaks and the belt mends it over time', min: 1, step: 10 },
    ],
  },
  {
    title: 'Loading',
    settings: [
      { key: 'depositItemsPerSecond', label: 'Deposit Rate (items / s)', hint: 'How fast the extractor takes the backpack from a player standing at it', min: 0.1, step: 1 },
      { key: 'unloadItemsPerSecond', label: 'Belt Unload Rate (items / s)', hint: 'How fast a player standing on the belt puts items on it', min: 0.1, step: 0.5 },
    ],
  },
];

const show = (n: number): number | '' => (Number.isFinite(n) ? n : '');

export default function ExtractorDetail() {
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
  const [extractor, setExtractor] = useState<ExtractorDefinition | null>(null);
  const [form, setForm] = useState<ExtractorForm>(NEW_EXTRACTOR);
  const [problems, setProblems] = useState<string[]>([]);
  const [particleEffects, setParticleEffects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchWithAuth('/api/admin/particle-effects')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setParticleEffects(Array.isArray(list) ? list : []))
      .catch(() => setParticleEffects([]));
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/extractors/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch extractor');
        const data: ExtractorDefinition = await res.json();
        setExtractor(data);
        setForm({
          key: data.key,
          name: data.name,
          description: data.description ?? '',
          width: data.width,
          height: data.height,
          entranceOffset: data.entranceOffset,
          landingSeconds: data.landingSeconds,
          shaftWidth: data.shaftWidth,
          buildSecondsPerSegment: data.buildSecondsPerSegment,
          beltSpeed: data.beltSpeed,
          beltItemSpacing: data.beltItemSpacing,
          depositItemsPerSecond: data.depositItemsPerSecond,
          unloadItemsPerSecond: data.unloadItemsPerSecond,
          beltSegmentHealth: data.beltSegmentHealth,
          health: data.health,
          landingParticleEffectId: data.landingParticleEffectId ?? '',
          isDefault: data.isDefault === true,
        });
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof ExtractorForm>(key: K, value: ExtractorForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  // The preview follows the form as it is typed, falling back to safe values for anything unfinished
  const preview = useMemo(() => {
    const pick = (value: number, fallback: number, min = 0.0001) => (Number.isFinite(value) && value >= min ? value : fallback);
    return {
      width: pick(form.width, DEFAULT_EXTRACTOR.width, 1),
      height: pick(form.height, DEFAULT_EXTRACTOR.height, 1),
      shaftWidth: Math.min(pick(form.shaftWidth, DEFAULT_EXTRACTOR.shaftWidth, 1), pick(form.width, DEFAULT_EXTRACTOR.width, 1)),
      landingSeconds: pick(form.landingSeconds, DEFAULT_EXTRACTOR.landingSeconds),
      buildSecondsPerSegment: pick(form.buildSecondsPerSegment, DEFAULT_EXTRACTOR.buildSecondsPerSegment),
      beltSpeed: pick(form.beltSpeed, DEFAULT_EXTRACTOR.beltSpeed),
      beltItemSpacing: pick(form.beltItemSpacing, DEFAULT_EXTRACTOR.beltItemSpacing),
      unloadItemsPerSecond: pick(form.unloadItemsPerSecond, DEFAULT_EXTRACTOR.unloadItemsPerSecond),
    };
  }, [form]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim() || null,
      landingParticleEffectId: form.landingParticleEffectId || null,
    };
    const errors = validateExtractor(body);
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/extractors' : `/api/admin/extractors/${extractor!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} extractor`);
      }
      const saved: ExtractorDefinition = await res.json();
      toast.success(isNew ? 'Extractor created!' : 'Extractor saved!');
      setProblems([]);
      if (isNew) navigate(`/extractors/${saved.id}`, { replace: true });
      else setExtractor((prev) => (prev ? { ...prev, ...saved } : saved));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!extractor) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/extractors/${extractor.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete extractor');
      }
      toast.success(`${extractor.name} deleted`);
      navigate('/extractors');
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

  if (notFound || (!isNew && !extractor)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Extractor not found</h3>
        <button onClick={() => navigate('/extractors')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Extractors
        </button>
      </div>
    );
  }

  return (
    <div className="extractor-detail-page max-w-6xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/extractors')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Extractors
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Extractor' : extractor!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{extractor!.key}</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Delete Extractor
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSave} noValidate className="lg:col-span-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 p-6">
            <h3 className="text-xl font-black text-white tracking-tight uppercase">Extractor Properties</h3>
            <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Its size, the belt, and how fast it takes loot</p>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="key" className={labelClass}>Key</label>
                <input
                  id="key"
                  type="text"
                  value={form.key}
                  disabled={!isNew}
                  placeholder="e.g. heavy_extractor"
                  onChange={(e) => set('key', e.target.value.toLowerCase())}
                  className={`${inputClass} font-mono disabled:opacity-60 disabled:cursor-not-allowed`}
                />
                <span className="text-[11px] text-slate-400 font-medium">
                  {isNew ? 'Lower case letters, digits and underscores. It cannot be changed later.' : 'The key cannot be changed once an extractor exists.'}
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

            {GROUPS.map((group) => (
              <section key={group.title} className="space-y-4">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">{group.title}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {group.settings.map((setting) => (
                    <div key={setting.key} className="space-y-2">
                      <label htmlFor={setting.key} className={labelClass}>{setting.label}</label>
                      <input
                        id={setting.key}
                        type="number"
                        min={setting.min}
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
            ))}

            <section className="space-y-4">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Effects</h4>
              <div className="space-y-2">
                <label htmlFor="landingParticleEffectId" className={labelClass}>Landing Dust</label>
                <select
                  id="landingParticleEffectId"
                  value={form.landingParticleEffectId}
                  onChange={(e) => set('landingParticleEffectId', e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">None</option>
                  {particleEffects.map((effect) => (
                    <option key={effect.id} value={effect.id}>{effect.name}</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 font-medium">A particle effect from the library, played where the machine touches down</span>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="h-5 w-5 cursor-pointer" />
                <span className="text-sm font-bold text-slate-700">The extractor a run lands (only one can be the default)</span>
              </label>
            </section>

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
                'Create Extractor'
              ) : (
                'Save Extractor'
              )}
            </button>
          </div>
        </form>

        <div className="space-y-8">
          <div className="lg:sticky lg:top-6 space-y-8">
            <ExtractorPreview settings={preview} />
            {isNew ? (
              <p className="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Save the extractor first, then you can give it art and sounds.
              </p>
            ) : (
              <>
                <ExtractorArt extractor={extractor!} onUploaded={(saved) => setExtractor((prev) => (prev ? { ...prev, textureUrl: saved.textureUrl, beltTextureUrl: saved.beltTextureUrl } : saved))} />
                <ExtractorSoundEffects extractor={extractor!} onSaved={(saved) => setExtractor((prev) => (prev ? { ...prev, soundEffects: saved.soundEffects } : saved))} />
              </>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Extractor?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{extractor?.name}</strong>? Runs already going keep it; new runs use the default (or the built-in extractor if none is left). This cannot be undone.
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
