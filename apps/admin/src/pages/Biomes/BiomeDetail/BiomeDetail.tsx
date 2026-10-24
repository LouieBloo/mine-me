import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BLOCK_SCALE, DEFAULT_BIOME_BLEND_WIDTH, DEFAULT_BIOME_NOISE_SCALE, validateBiome,
  type BiomeAmbient, type BiomeBlockSwap, type BiomeDefinition,
} from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import WeightTable, { type WeightOption } from '../../../components/WeightTable/WeightTable';
import BiomePreview from '../../../components/BiomePreview/BiomePreview';
import BlockSwapsEditor from './BlockSwapsEditor/BlockSwapsEditor';
import BiomeAmbientPanel from './BiomeAmbientPanel/BiomeAmbientPanel';
import './BiomeDetail.css';

type WeightMap = Record<string, number> | null;

interface BiomeForm {
  key: string;
  name: string;
  description: string;
  isDefault: boolean;
  minDepth: number;
  /** NaN while the field is empty; null means "to the bottom of the map". */
  maxDepth: number | null;
  weight: number;
  noiseScale: number;
  blockWeights: WeightMap;
  swaps: BiomeBlockSwap[] | undefined;
  fluidWeights: WeightMap;
  gasWeights: WeightMap;
  mobSpawns: WeightMap;
  ambient: BiomeAmbient | null;
}

/** What a brand new biome starts as: a plain region that changes nothing until the owner says how. */
export const NEW_BIOME: BiomeForm = {
  key: '',
  name: '',
  description: '',
  isDefault: false,
  minDepth: 0,
  maxDepth: null,
  weight: 1,
  noiseScale: DEFAULT_BIOME_NOISE_SCALE,
  blockWeights: null,
  swaps: undefined,
  fluidWeights: null,
  gasWeights: null,
  mobSpawns: null,
  ambient: null,
};

const inputClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';
const show = (n: number | null | undefined): number | '' => (typeof n === 'number' && Number.isFinite(n) ? n : '');
const readNumber = (raw: string): number => (raw === '' ? NaN : Number(raw));

/** The form turned into what the server stores (the shared `BiomeDefinition` shape). */
export function formToBiome(form: BiomeForm): Partial<BiomeDefinition> {
  const palette = form.blockWeights || (form.swaps && form.swaps.length > 0)
    ? { ...(form.blockWeights ? { weights: form.blockWeights } : {}), ...(form.swaps && form.swaps.length > 0 ? { swaps: form.swaps } : {}) }
    : null;
  return {
    key: form.key,
    name: form.name.trim(),
    description: form.description.trim() || null,
    isDefault: form.isDefault,
    minDepth: form.minDepth,
    maxDepth: form.maxDepth,
    weight: form.weight,
    noiseScale: form.noiseScale,
    blockPalette: palette,
    fluidWeights: form.fluidWeights,
    gasWeights: form.gasWeights,
    mobSpawns: form.mobSpawns,
    ambient: form.ambient,
  };
}

function biomeToForm(biome: BiomeDefinition): BiomeForm {
  return {
    key: biome.key,
    name: biome.name,
    description: biome.description ?? '',
    isDefault: biome.isDefault,
    minDepth: biome.minDepth,
    maxDepth: biome.maxDepth ?? null,
    weight: biome.weight,
    noiseScale: biome.noiseScale,
    blockWeights: biome.blockPalette?.weights ?? null,
    swaps: biome.blockPalette?.swaps ?? undefined,
    fluidWeights: biome.fluidWeights ?? null,
    gasWeights: biome.gasWeights ?? null,
    mobSpawns: biome.mobSpawns ?? null,
    ambient: biome.ambient ?? null,
  };
}

/** Drops table entries still being typed (a blank number) so a half-edited form still previews. */
const settled = (table: WeightMap): WeightMap => {
  if (!table) return null;
  const entries = Object.entries(table).filter(([, v]) => Number.isFinite(v) && v >= 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

/**
 * The biome as the preview should see it: whatever is half typed is replaced by something safe, so a blank name or an
 * empty number never turns the preview into an error while the owner is still editing.
 */
export function previewBiome(form: BiomeForm, id: string): Partial<BiomeDefinition> {
  const minDepth = Number.isFinite(form.minDepth) && form.minDepth >= 0 ? form.minDepth : 0;
  const maxDepth = form.maxDepth !== null && Number.isFinite(form.maxDepth) && form.maxDepth >= minDepth ? form.maxDepth : null;
  const swaps = (form.swaps ?? []).filter((s) => s.chance === undefined || Number.isFinite(s.chance));
  const biome = formToBiome({ ...form, blockWeights: settled(form.blockWeights), swaps, fluidWeights: settled(form.fluidWeights), gasWeights: settled(form.gasWeights), mobSpawns: settled(form.mobSpawns) });
  return {
    ...biome,
    id,
    key: /^[a-z][a-z0-9_]*$/.test(form.key) ? form.key : 'new_biome',
    name: form.name.trim() || 'New biome',
    minDepth,
    maxDepth,
    weight: Number.isFinite(form.weight) && form.weight > 0 ? form.weight : 1,
    noiseScale: Number.isFinite(form.noiseScale) && form.noiseScale >= 3 ? form.noiseScale : DEFAULT_BIOME_NOISE_SCALE,
  };
}

const toOptions = <T,>(list: T[], key: (item: T) => string, label: (item: T) => string): WeightOption[] =>
  list.map((item) => ({ key: key(item), label: label(item) }));

export default function BiomeDetail() {
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
  const [biome, setBiome] = useState<BiomeDefinition | null>(null);
  const [form, setForm] = useState<BiomeForm>(NEW_BIOME);
  const [problems, setProblems] = useState<string[]>([]);
  const [others, setOthers] = useState<BiomeDefinition[]>([]);
  const [blockOptions, setBlockOptions] = useState<WeightOption[]>([]);
  const [fluidOptions, setFluidOptions] = useState<WeightOption[]>([]);
  const [gasOptions, setGasOptions] = useState<WeightOption[]>([]);
  const [mobOptions, setMobOptions] = useState<WeightOption[]>([]);
  const [blendWidth, setBlendWidth] = useState(DEFAULT_BIOME_BLEND_WIDTH);

  // What the pickers offer, the other biomes (for the preview) and the map's blend width. The biome can be edited
  // without any of them, so a failure is reported and the lists stay empty.
  useEffect(() => {
    const load = async <T,>(url: string, apply: (list: T[]) => void, what: string) => {
      try {
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error(`Failed to fetch ${what}`);
        const data = await res.json();
        apply(Array.isArray(data) ? data : []);
      } catch (err: any) {
        toast.error(err.message);
      }
    };
    void load<{ typeKey: string; name: string }>('/api/admin/blocks', (l) => setBlockOptions(toOptions(l, (b) => b.typeKey, (b) => b.name || b.typeKey)), 'blocks');
    void load<{ typeKey: string; name: string }>('/api/admin/fluids', (l) => setFluidOptions(toOptions(l, (f) => f.typeKey, (f) => f.name || f.typeKey)), 'fluids');
    void load<{ typeKey: string; name: string }>('/api/admin/gases', (l) => setGasOptions(toOptions(l, (g) => g.typeKey, (g) => g.name || g.typeKey)), 'gases');
    void load<{ id: string; name: string }>('/api/admin/mobs', (l) => setMobOptions(toOptions(l, (m) => m.id, (m) => m.name || m.id)), 'mobs');
    void load<BiomeDefinition>('/api/admin/biomes', setOthers, 'biomes');
    fetchWithAuth('/api/admin/mining-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (config && typeof config.biomeBlendWidth === 'number') setBlendWidth(config.biomeBlendWidth);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/biomes/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch biome');
        const data: BiomeDefinition = await res.json();
        setBiome(data);
        setForm(biomeToForm(data));
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof BiomeForm>(key: K, value: BiomeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  // The strip the preview generates: every saved biome, with this one in its current (unsaved) state
  const previewBiomes = useMemo(() => {
    const mine = previewBiome(form, biome?.id ?? 'draft');
    const rest = others.filter((o) => o.id !== biome?.id && o.key !== mine.key);
    // A draft made the default replaces the old default in the preview too
    return [...rest.map((o) => (form.isDefault && o.isDefault ? { ...o, isDefault: false } : o)), mine];
  }, [form, others, biome?.id]);

  const swapBlocks = blockOptions;
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = formToBiome(form);
    const errors = validateBiome(body);
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/biomes' : `/api/admin/biomes/${biome!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} biome`);
      }
      const saved: BiomeDefinition = await res.json();
      toast.success(isNew ? 'Biome created!' : 'Biome saved!');
      setProblems([]);
      if (isNew) {
        navigate(`/biomes/${saved.id}`, { replace: true });
      } else {
        setBiome(saved);
        setForm(biomeToForm(saved));
      }
      // The list the preview draws from changes with a save (a new default, a renamed biome...)
      fetchWithAuth('/api/admin/biomes').then((r) => (r.ok ? r.json() : null)).then((l) => Array.isArray(l) && setOthers(l)).catch(() => undefined);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!biome) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/biomes/${biome.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete biome');
      }
      toast.success(`${biome.name} deleted`);
      navigate('/biomes');
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

  if (notFound || (!isNew && !biome)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Biome not found</h3>
        <button onClick={() => navigate('/biomes')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Biomes
        </button>
      </div>
    );
  }

  const original = (blocks: number | null | undefined) => (typeof blocks === 'number' && Number.isFinite(blocks) ? `${(blocks / BLOCK_SCALE).toFixed(1)} original blocks` : '');

  return (
    <div className="biome-detail-page max-w-7xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/biomes')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Biomes
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Biome' : biome!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{biome!.key}</span>}
            {!isNew && biome!.isDefault && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-wider rounded-full">Default</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            disabled={biome!.isDefault}
            title={biome!.isDefault ? 'The default biome cannot be deleted: make another biome the default first' : undefined}
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          >
            Delete Biome
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSave} noValidate className="lg:col-span-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 p-6">
            <h3 className="text-xl font-black text-white tracking-tight uppercase">Biome Properties</h3>
            <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Where it is, what it makes and how it looks</p>
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
                  placeholder="e.g. frozen_caves"
                  onChange={(e) => set('key', e.target.value.toLowerCase())}
                  className={`${inputClass} font-mono disabled:opacity-60 disabled:cursor-not-allowed`}
                />
                <span className="text-[11px] text-slate-400 font-medium">
                  {isNew ? 'Lower case letters, digits and underscores. It cannot be changed later.' : 'The key cannot be changed once a biome exists.'}
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

            <label className="flex items-start gap-3 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl transition-colors">
              <input
                type="checkbox"
                aria-label="Default biome"
                checked={form.isDefault}
                disabled={Boolean(biome?.isDefault)}
                onChange={(e) => set('isDefault', e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
              />
              <span>
                <span className="block text-xs font-black uppercase tracking-wider text-slate-700">Default biome</span>
                <span className="block text-[11px] text-slate-400 font-medium">
                  {biome?.isDefault
                    ? 'This is the default, used wherever no other biome fits. To change it, make another biome the default.'
                    : 'Used wherever no other biome fits. Making this the default takes the role from the current one.'}
                </span>
              </span>
            </label>

            <section className="space-y-4">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Where</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="minDepth" className={labelClass}>Shallowest Row</label>
                  <input id="minDepth" type="number" min={0} step={1} value={show(form.minDepth)} onChange={(e) => set('minDepth', readNumber(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-slate-400 font-medium">Counted from the ground, in blocks. {original(form.minDepth)}</span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="maxDepth" className={labelClass}>Deepest Row</label>
                  <input
                    id="maxDepth"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Bottom of the map"
                    value={form.maxDepth === null ? '' : show(form.maxDepth)}
                    onChange={(e) => set('maxDepth', e.target.value === '' ? null : Number(e.target.value))}
                    className={inputClass}
                  />
                  <span className="text-[11px] text-slate-400 font-medium">Leave empty to go down to the bottom. {original(form.maxDepth)}</span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="weight" className={labelClass}>Weight</label>
                  <input id="weight" type="number" min={0.1} step={0.1} value={show(form.weight)} onChange={(e) => set('weight', readNumber(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-slate-400 font-medium">How strongly it wins where biomes overlap: higher means bigger and more common (1 is equal)</span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="noiseScale" className={labelClass}>Region Size</label>
                  <input id="noiseScale" type="number" min={3} step={1} value={show(form.noiseScale)} onChange={(e) => set('noiseScale', readNumber(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-slate-400 font-medium">About how wide one region is, in blocks. {original(form.noiseScale)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">What It Makes</h4>
              <WeightTable
                id="block-weights"
                title="Block Amounts"
                hint="How much of a block is placed here compared with the rest of the mine: 1 is the usual, 2 is double, 0 is none"
                value={form.blockWeights}
                options={blockOptions}
                onChange={(v) => set('blockWeights', v)}
              />
              <BlockSwapsEditor value={form.swaps} blocks={swapBlocks} onChange={(v) => set('swaps', v)} />
              <WeightTable
                id="fluid-weights"
                title="Fluid Pockets"
                hint="How many pockets of a fluid are made here compared with the rest of the mine: 1 is the usual, 0 is none"
                value={form.fluidWeights}
                options={fluidOptions}
                onChange={(v) => set('fluidWeights', v)}
              />
              <WeightTable
                id="gas-weights"
                title="Gas Pockets"
                hint="How many pockets of a gas are made here compared with the rest of the mine: 1 is the usual, 0 is none"
                value={form.gasWeights}
                options={gasOptions}
                onChange={(v) => set('gasWeights', v)}
              />
              <WeightTable
                id="mob-spawns"
                title="Mob Spawns"
                hint="Which mobs live here and how likely each is. Leave empty to use the mine's usual mob list"
                value={form.mobSpawns}
                options={mobOptions}
                onChange={(v) => set('mobSpawns', v)}
                emptyText="Nothing set: the mine's usual mobs."
              />
            </section>

            <BiomeAmbientPanel value={form.ambient} onChange={(v) => set('ambient', v)} biomeId={isNew ? undefined : biome?.id} />

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
                'Create Biome'
              ) : (
                'Save Biome'
              )}
            </button>
          </div>
        </form>

        <div className="space-y-8">
          <div className="lg:sticky lg:top-6">
            <BiomePreview biomes={previewBiomes} blendWidth={blendWidth} />
          </div>
        </div>
      </div>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Biome?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{biome?.name}</strong>? Mines that are already running keep it, but new mines will no longer have it. This cannot be undone.
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
