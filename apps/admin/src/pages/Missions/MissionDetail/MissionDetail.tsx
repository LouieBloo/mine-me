import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { validateMission, type MissionDefinition, type MissionLookups } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import { NEW_MISSION, TIER_NAMES, formToMission, missionToForm, tierName, type MissionForm } from '../missionForm';
import ObjectivesEditor, { type TargetOptions } from './ObjectivesEditor/ObjectivesEditor';
import RewardItemsEditor from './RewardItemsEditor/RewardItemsEditor';
import MissionRequirements from './MissionRequirements/MissionRequirements';
import MissionSoundEffects from './MissionSoundEffects/MissionSoundEffects';
import { hintClass, inputClass, labelClass, readNumber, show } from '../../Doodads/DoodadDetail/panelStyles';
import './MissionDetail.css';

type Named = { id: string; name: string };
const EMPTY_TARGETS: TargetOptions = { item: [], mob: [], fluid: [], gas: [] };

/** The lists the form can be checked against before it is sent (the server checks again, and also that an item can be mined). */
const lookupsFor = (targets: TargetOptions): MissionLookups => {
  const has = (list: Named[]) => (id: string) => list.some((x) => x.id === id);
  return {
    hasItem: has(targets.item),
    hasMob: has(targets.mob),
    hasFluid: has(targets.fluid),
    hasGas: has(targets.gas),
    nameOf: (kind, id) => targets[kind].find((x) => x.id === id)?.name,
  };
};

export default function MissionDetail() {
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
  const [mission, setMission] = useState<MissionDefinition | null>(null);
  const [form, setForm] = useState<MissionForm>(NEW_MISSION);
  const [problems, setProblems] = useState<string[]>([]);
  const [targets, setTargets] = useState<TargetOptions>(EMPTY_TARGETS);

  // What the pickers offer. A failure is reported and the list stays empty.
  useEffect(() => {
    const load = async (url: string, kind: keyof TargetOptions, what: string) => {
      try {
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error(`Failed to fetch ${what}`);
        const data = await res.json();
        const list: Named[] = (Array.isArray(data) ? data : []).map((x: any) => ({ id: x.id, name: x.name || x.typeKey || x.id }));
        setTargets((prev) => ({ ...prev, [kind]: list }));
      } catch (err: any) {
        toast.error(err.message);
      }
    };
    void load('/api/admin/items', 'item', 'items');
    void load('/api/admin/mobs', 'mob', 'mobs');
    void load('/api/admin/fluids', 'fluid', 'fluids');
    void load('/api/admin/gases', 'gas', 'gases');
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/missions/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch mission');
        const data: MissionDefinition = await res.json();
        setMission(data);
        setForm(missionToForm(data));
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof MissionForm>(key: K, value: MissionForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = formToMission(form);
    // Only what can be checked here: the lists loaded for the pickers, and the shape of the form
    const errors = validateMission(body, lookupsFor(targets));
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/missions' : `/api/admin/missions/${mission!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} mission`);
      }
      const saved: MissionDefinition = await res.json();
      toast.success(isNew ? 'Mission created!' : 'Mission saved!');
      setProblems([]);
      if (isNew) {
        navigate(`/missions/${saved.id}`, { replace: true });
      } else {
        setMission(saved);
        setForm(missionToForm(saved));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!mission) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/missions/${mission.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete mission');
      }
      toast.success(`${mission.name} deleted`);
      navigate('/missions');
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

  if (notFound || (!isNew && !mission)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Mission not found</h3>
        <button onClick={() => navigate('/missions')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Missions
        </button>
      </div>
    );
  }

  return (
    <div className="mission-detail-page max-w-5xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/missions')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Missions
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Mission' : mission!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{mission!.key}</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
          >
            Delete Mission
          </button>
        )}
      </div>

      <form onSubmit={handleSave} noValidate className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 p-6">
          <h3 className="text-xl font-black text-white tracking-tight uppercase">Mission Properties</h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">What the player is asked to do, who is offered it and what it pays</p>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="key" className={labelClass}>Key</label>
              <input id="key" type="text" value={form.key} disabled={!isNew} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="copper_run" className={`${inputClass} font-mono disabled:opacity-60`} />
              <span className={hintClass}>{isNew ? 'Lower case letters, digits and underscores. It cannot be changed later.' : 'The key is fixed once the mission exists.'}</span>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label htmlFor="minLevel" className={labelClass}>Min Level</label>
              <input id="minLevel" type="number" min={1} step={1} value={show(form.minLevel)} onChange={(e) => set('minLevel', readNumber(e.target.value))} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="maxLevel" className={labelClass}>Max Level</label>
              <input id="maxLevel" type="number" min={1} step={1} value={show(form.maxLevel)} onChange={(e) => set('maxLevel', readNumber(e.target.value))} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="tier" className={labelClass}>Tier</label>
              <select id="tier" value={form.tier} onChange={(e) => set('tier', Number(e.target.value))} className={`${inputClass} cursor-pointer`}>
                {Object.keys(TIER_NAMES).map((t) => (
                  <option key={t} value={t}>{tierName(Number(t))}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="weight" className={labelClass}>Weight</label>
              <input id="weight" type="number" min={0.1} step={0.1} value={show(form.weight)} onChange={(e) => set('weight', readNumber(e.target.value))} className={inputClass} />
            </div>
          </div>
          <p className={hintClass}>A character is only offered the mission while their level is between the minimum and maximum. Weight is how likely it is, against the other missions that fit.</p>

          <ObjectivesEditor value={form.objectives} targets={targets} onChange={(v) => set('objectives', v)} />
          <MissionRequirements form={form} />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="rewardSol" className={labelClass}>Reward Sol</label>
              <input id="rewardSol" type="number" min={0} step={1} value={show(form.rewardSol)} onChange={(e) => set('rewardSol', readNumber(e.target.value))} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label htmlFor="rewardXp" className={labelClass}>Reward XP</label>
              <input id="rewardXp" type="number" min={0} step={1} value={show(form.rewardXp)} onChange={(e) => set('rewardXp', readNumber(e.target.value))} className={inputClass} />
            </div>
          </div>
          <RewardItemsEditor value={form.rewardItems} items={targets.item} onChange={(v) => set('rewardItems', v)} />

          {!isNew && mission && <MissionSoundEffects mission={mission} onSaved={(saved) => setMission((prev) => (prev ? { ...prev, soundEffects: saved.soundEffects, sounds: saved.sounds } : saved))} />}
          {isNew && <p className={hintClass}>Save the mission first, then give it sounds.</p>}

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
              'Create Mission'
            ) : (
              'Save Mission'
            )}
          </button>
        </div>
      </form>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Mission?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{mission?.name}</strong>? Runs already started keep it, but it will no longer be offered. This cannot be undone.
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
