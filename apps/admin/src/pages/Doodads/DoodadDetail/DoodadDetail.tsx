import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BLOCK_SCALE, DOODAD_ANCHORS, getAssetUrl, validateDoodad, type DoodadAnchor, type DoodadDefinition, type ParticleEffect } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import DoodadPreview, { type DoodadPreviewChange } from '../../../components/DoodadPreview/DoodadPreview';
import { NEW_DOODAD, doodadToForm, formToDoodad, previewDoodad, type DoodadForm } from '../doodadForm';
import type { KeyChipOption } from './KeyChips/KeyChips';
import DoodadSizeVariantsEditor from './DoodadSizeVariantsEditor/DoodadSizeVariantsEditor';
import DoodadArtPanel from './DoodadArtPanel/DoodadArtPanel';
import DoodadDamagePanel from './DoodadDamagePanel/DoodadDamagePanel';
import DoodadMotionPanel from './DoodadMotionPanel/DoodadMotionPanel';
import DoodadBehaviourPanel from './DoodadBehaviourPanel/DoodadBehaviourPanel';
import DoodadEffectsPanel from './DoodadEffectsPanel/DoodadEffectsPanel';
import DoodadSpawnPanel from './DoodadSpawnPanel/DoodadSpawnPanel';
import DoodadBiomeLinks, { type BiomeOption } from './DoodadBiomeLinks/DoodadBiomeLinks';
import DoodadSoundEffects from './DoodadSoundEffects/DoodadSoundEffects';
import { hintClass, inputClass, labelClass, readNumber, show } from './panelStyles';
import './DoodadDetail.css';

const ANCHOR_TEXT: Record<DoodadAnchor, string> = {
  FLOOR: 'Floor: stands on top of a block (mushrooms, grass)',
  CEILING: 'Ceiling: hangs under a block (stalactites, drips, roots)',
  WALL: 'Wall: clings to the side of a block (moss, vines)',
  AIR: 'Air: floats free (fireflies, spores, dust)',
};

const original = (cells: number | null | undefined): string => (typeof cells === 'number' && Number.isFinite(cells) ? `${(cells / BLOCK_SCALE).toFixed(1)} original blocks` : '');

/** The key/label list a chip picker shows, from the name lists the server returns. */
const chipOptions = (list: Array<{ typeKey: string; name?: string }>): KeyChipOption[] => list.map((item) => ({ key: item.typeKey, label: item.name || item.typeKey }));

export default function DoodadDetail() {
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
  const [doodad, setDoodad] = useState<DoodadDefinition | null>(null);
  const [form, setForm] = useState<DoodadForm>(NEW_DOODAD);
  const [problems, setProblems] = useState<string[]>([]);
  const [biomes, setBiomes] = useState<BiomeOption[]>([]);
  const [blocks, setBlocks] = useState<KeyChipOption[]>([]);
  const [fluids, setFluids] = useState<KeyChipOption[]>([]);
  const [gases, setGases] = useState<KeyChipOption[]>([]);
  const [particleEffects, setParticleEffects] = useState<ParticleEffect[]>([]);

  // What the pickers offer. The doodad can be edited without any of them, so a failure is reported and the list stays empty.
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
    void load<{ id: string; key: string; name: string }>('/api/admin/biomes', (l) => setBiomes(l.map((b) => ({ id: b.id, key: b.key, name: b.name || b.key }))), 'biomes');
    void load<{ typeKey: string; name: string }>('/api/admin/blocks', (l) => setBlocks(chipOptions(l)), 'blocks');
    void load<{ typeKey: string; name: string }>('/api/admin/fluids', (l) => setFluids(chipOptions(l)), 'fluids');
    void load<{ typeKey: string; name: string }>('/api/admin/gases', (l) => setGases(chipOptions(l)), 'gases');
    void load<ParticleEffect>('/api/admin/particle-effects', setParticleEffects, 'particle effects');
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/doodads/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch doodad');
        const data: DoodadDefinition = await res.json();
        setDoodad(data);
        setForm(doodadToForm(data));
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof DoodadForm>(key: K, value: DoodadForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  // A doodad floating in the air cannot crawl or hop: moving it into the air turns a crawler into a flutterer
  const setAnchor = (anchor: DoodadAnchor) => {
    setForm((prev) => ({ ...prev, anchor, wander: prev.wander && anchor === 'AIR' && prev.wander.mode !== 'FLUTTER' ? { ...prev.wander, mode: 'FLUTTER' } : prev.wander }));
    setProblems([]);
  };

  const preview = useMemo(() => previewDoodad(form, doodad?.id ?? 'draft'), [form, doodad?.id]);
  const particleConfig = particleEffects.find((p) => p.id === form.particleEffectId)?.config ?? null;
  const puffConfig = particleEffects.find((p) => p.id === form.reacts?.puffEffectId)?.config ?? null;
  const ambient = doodad?.sounds?.ambient;
  const ambientSound = ambient?.url ? { url: ambient.url, volume: ambient.volume, loop: ambient.loop } : null;

  const applyPreviewChange = (fields: DoodadPreviewChange) => {
    setForm((prev) => ({
      ...prev,
      ...(fields.particleOffsetX !== undefined ? { particleOffsetX: fields.particleOffsetX } : {}),
      ...(fields.particleOffsetY !== undefined ? { particleOffsetY: fields.particleOffsetY } : {}),
      ...(fields.light ? { light: fields.light } : {}),
    }));
    setProblems([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = formToDoodad(form);
    const errors = validateDoodad(body);
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/doodads' : `/api/admin/doodads/${doodad!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} doodad`);
      }
      const saved: DoodadDefinition = await res.json();
      toast.success(isNew ? 'Doodad created!' : 'Doodad saved!');
      setProblems([]);
      if (isNew) {
        navigate(`/doodads/${saved.id}`, { replace: true });
      } else {
        setDoodad(saved);
        setForm(doodadToForm(saved));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!doodad) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/doodads/${doodad.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete doodad');
      }
      toast.success(`${doodad.name} deleted`);
      navigate('/doodads');
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

  if (notFound || (!isNew && !doodad)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Doodad not found</h3>
        <button onClick={() => navigate('/doodads')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Doodads
        </button>
      </div>
    );
  }

  return (
    <div className="doodad-detail-page max-w-7xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/doodads')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Doodads
          </button>
          <div className="flex items-center gap-3">
            {doodad?.textureUrl && <img src={getAssetUrl(doodad.textureUrl)} alt="" className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} />}
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Doodad' : doodad!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{doodad!.key}</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Delete Doodad
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSave} noValidate className="lg:col-span-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 p-6">
            <h3 className="text-xl font-black text-white tracking-tight uppercase">Doodad Properties</h3>
            <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">What it is, how it looks and moves, and where it grows</p>
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
                  placeholder="e.g. glow_mushroom"
                  onChange={(e) => set('key', e.target.value.toLowerCase())}
                  className={`${inputClass} font-mono disabled:opacity-60 disabled:cursor-not-allowed`}
                />
                <span className={hintClass}>{isNew ? 'Lower case letters, digits and underscores. It cannot be changed later.' : 'The key cannot be changed once a doodad exists.'}</span>
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
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Shape</h4>
              <div className="space-y-2">
                <label htmlFor="anchor" className={labelClass}>Anchor</label>
                <select id="anchor" value={form.anchor} onChange={(e) => setAnchor(e.target.value as DoodadAnchor)} className={`${inputClass} cursor-pointer`}>
                  {DOODAD_ANCHORS.map((a) => (
                    <option key={a} value={a}>{ANCHOR_TEXT[a]}</option>
                  ))}
                </select>
                <span className={hintClass}>What the doodad is attached to. If that block is mined or blown up, the doodad goes with it (air doodads stay).</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label htmlFor="width" className={labelClass}>Width</label>
                  <input id="width" type="number" min={1} step={1} value={show(form.width)} onChange={(e) => set('width', readNumber(e.target.value))} className={inputClass} />
                  <span className={hintClass}>In blocks. {original(form.width)}</span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="height" className={labelClass}>Height</label>
                  <input id="height" type="number" min={1} step={1} value={show(form.height)} onChange={(e) => set('height', readNumber(e.target.value))} className={inputClass} />
                  <span className={hintClass}>In blocks. {original(form.height)}</span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="zOffset" className={labelClass}>Draw Order</label>
                  <input id="zOffset" type="number" step={1} value={show(form.zOffset)} onChange={(e) => set('zOffset', readNumber(e.target.value))} className={inputClass} />
                  <span className={hintClass}>Higher is drawn later, over lower doodads</span>
                </div>
              </div>
              <DoodadSizeVariantsEditor value={form.sizeVariants} baseWidth={form.width} baseHeight={form.height} onChange={(v) => set('sizeVariants', v)} />
            </section>

            <DoodadArtPanel
              doodadId={doodad?.id}
              textureUrl={form.textureUrl}
              parts={form.parts}
              onTextureChange={(url) => set('textureUrl', url)}
              onPartsChange={(parts) => set('parts', parts)}
            />
            <DoodadMotionPanel value={form.motion} parts={form.parts} onChange={(v) => set('motion', v)} />
            <DoodadBehaviourPanel
              anchor={form.anchor}
              reacts={form.reacts}
              wander={form.wander}
              particleEffects={particleEffects}
              onReactsChange={(v) => set('reacts', v)}
              onWanderChange={(v) => set('wander', v)}
            />
            <DoodadEffectsPanel
              light={form.light}
              particleEffectId={form.particleEffectId}
              particleEffects={particleEffects}
              onLightChange={(v) => set('light', v)}
              onParticleChange={(v) => set('particleEffectId', v)}
            />
            <DoodadDamagePanel
              anchor={form.anchor}
              health={form.health}
              fallDamage={form.fallDamage}
              deathParticleEffectId={form.deathParticleEffectId}
              particleEffects={particleEffects}
              onHealthChange={(v) => set('health', v)}
              onFallDamageChange={(v) => set('fallDamage', v)}
              onDeathEffectChange={(v) => set('deathParticleEffectId', v)}
            />
            <DoodadSpawnPanel value={form.spawn} onChange={(v) => set('spawn', v)} blocks={blocks} fluids={fluids} gases={gases} />
            <DoodadBiomeLinks value={form.biomes} biomes={biomes} onChange={(v) => set('biomes', v)} />

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
                'Create Doodad'
              ) : (
                'Save Doodad'
              )}
            </button>

            {doodad ? (
              <DoodadSoundEffects doodad={doodad} onSaved={(saved) => setDoodad((prev) => (prev ? { ...prev, soundEffects: saved.soundEffects, sounds: saved.sounds } : saved))} />
            ) : (
              <p className={hintClass}>Sounds can be added once the doodad is created.</p>
            )}
          </div>
        </form>

        <div className="space-y-8">
          <div className="lg:sticky lg:top-6">
            <DoodadPreview
              doodad={preview}
              particleConfig={particleConfig}
              particleName={particleEffects.find((p) => p.id === form.particleEffectId)?.name}
              puffConfig={puffConfig}
              ambientSound={ambientSound}
              onChange={applyPreviewChange}
            />
          </div>
        </div>
      </div>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Doodad?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{doodad?.name}</strong>? Mines that are already running keep it, but new mines will no longer have it. This cannot be undone.
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
