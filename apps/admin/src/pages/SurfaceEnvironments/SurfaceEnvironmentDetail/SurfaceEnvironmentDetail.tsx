import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { validateSurfaceEnvironment, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { Modal } from '../../../components/Modal/Modal';
import SurfacePreview from '../../../components/SurfacePreview/SurfacePreview';
import { hintClass, inputClass, labelClass, readNumber, show } from '../../Doodads/DoodadDetail/panelStyles';
import { environmentToForm, formToEnvironment, newEnvironment, previewEnvironment, type SurfaceEnvironmentForm } from '../surfaceEnvironmentForm';
import SkyPanel from './SkyPanel/SkyPanel';
import LayersEditor from './LayersEditor/LayersEditor';
import CloudsPanel from './CloudsPanel/CloudsPanel';
import WeatherPanel from './WeatherPanel/WeatherPanel';
import PropsEditor, { type PropDoodad } from './PropsEditor/PropsEditor';
import SurfaceSoundEffects from './SurfaceSoundEffects/SurfaceSoundEffects';
import './SurfaceEnvironmentDetail.css';

export default function SurfaceEnvironmentDetail() {
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
  const [environment, setEnvironment] = useState<SurfaceEnvironmentDefinition | null>(null);
  const [form, setForm] = useState<SurfaceEnvironmentForm>(newEnvironment());
  const [problems, setProblems] = useState<string[]>([]);
  const [doodads, setDoodads] = useState<PropDoodad[]>([]);

  // The doodads a prop can be. A failure is reported and the list stays empty.
  useEffect(() => {
    fetchWithAuth('/api/admin/doodads')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch doodads');
        return res.json();
      })
      .then((data: Array<{ key: string; name: string; anchor: string }>) => setDoodads(data.map((d) => ({ key: d.key, name: d.name, anchor: d.anchor }))))
      .catch((err) => toast.error(err.message));
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/surface-environments/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to fetch the surface environment');
        const data: SurfaceEnvironmentDefinition = await res.json();
        setEnvironment(data);
        setForm(environmentToForm(data));
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof SurfaceEnvironmentForm>(key: K, value: SurfaceEnvironmentForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setProblems([]);
  };

  const preview = useMemo(() => previewEnvironment(form), [form]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = formToEnvironment(form);
    const errors = validateSurfaceEnvironment(body);
    if (errors.length > 0) {
      setProblems(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(isNew ? '/api/admin/surface-environments' : `/api/admin/surface-environments/${environment!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (Array.isArray(err.errors)) setProblems(err.errors);
        throw new Error(err.error || `Failed to ${isNew ? 'create' : 'save'} the environment`);
      }
      const saved: SurfaceEnvironmentDefinition = await res.json();
      toast.success(isNew ? 'Environment created!' : 'Environment saved!');
      setProblems([]);
      if (isNew) {
        navigate(`/surface-environments/${saved.id}`, { replace: true });
      } else {
        setEnvironment(saved);
        setForm(environmentToForm(saved));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!environment) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/admin/surface-environments/${environment.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete the environment');
      }
      toast.success(`${environment.name} deleted`);
      navigate('/surface-environments');
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

  if (notFound || (!isNew && !environment)) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-slate-700">Environment not found</h3>
        <button onClick={() => navigate('/surface-environments')} className="cursor-pointer mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold">
          Back to Surface
        </button>
      </div>
    );
  }

  return (
    <div className="surface-environment-detail-page max-w-5xl mx-auto space-y-8 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/surface-environments')} className="cursor-pointer text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2">
            ← Back to Surface
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{isNew ? 'New Environment' : environment!.name}</h2>
            {!isNew && <span className="px-3 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-full">{environment!.key}</span>}
          </div>
        </div>
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={environment!.isDefault}
            title={environment!.isDefault ? 'The default environment cannot be deleted: make another one the default first' : undefined}
            className="cursor-pointer px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-400 font-bold text-xs uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Environment
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
        <SurfacePreview environment={preview} />
      </div>

      <form onSubmit={handleSave} noValidate className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 p-6">
          <h3 className="text-xl font-black text-white tracking-tight uppercase">Environment Properties</h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">The look, weather and props of the surface above the ground. All of it is cosmetic.</p>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="key" className={labelClass}>Key</label>
              <input id="key" type="text" value={form.key} disabled={!isNew} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="green_valley" className={`${inputClass} font-mono disabled:opacity-60`} />
              <span className={hintClass}>{isNew ? 'Lower case letters, digits and underscores. It cannot be changed later.' : 'The key is fixed once the environment exists.'}</span>
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

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="weight" className={labelClass}>Weight</label>
              <input id="weight" type="number" min={0.1} step={0.1} value={show(form.weight)} onChange={(e) => set('weight', readNumber(e.target.value))} className={inputClass} />
              <span className={hintClass}>How likely a run is to get this place, against the others.</span>
            </div>
            <div className="space-y-2">
              <span className={labelClass}>Default</span>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer w-fit">
                <input type="checkbox" checked={form.isDefault} disabled={!isNew && environment!.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="cursor-pointer" />
                The environment used when none can be picked
              </label>
              <span className={hintClass}>There is always exactly one. The first one made is the default.</span>
            </div>
          </div>

          <SkyPanel form={form} onChange={set} />
          <LayersEditor layers={form.layers} environmentId={environment?.id} onChange={(v) => set('layers', v)} />
          <CloudsPanel form={form} environmentId={environment?.id} onChange={set} />
          <WeatherPanel weather={form.weather} onChange={(v) => set('weather', v)} />
          <PropsEditor props={form.props} doodads={doodads} onChange={(v) => set('props', v)} />

          {!isNew && environment && <SurfaceSoundEffects environment={environment} onSaved={(saved) => setEnvironment((prev) => (prev ? { ...prev, soundEffects: saved.soundEffects, sounds: saved.sounds } : saved))} />}
          {isNew && <p className={hintClass}>Save the environment first, then upload pictures and give it sounds.</p>}

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
              'Create Environment'
            ) : (
              'Save Environment'
            )}
          </button>
        </div>
      </form>

      <Modal isOpen={confirmingDelete} onClose={() => !deleting && setConfirmingDelete(false)} title="Delete Environment?">
        <div className="p-6 space-y-6">
          <p className="text-slate-600 font-medium">
            Delete <strong>{environment?.name}</strong>? Runs already started keep it, but new runs will no longer get it. This cannot be undone.
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
