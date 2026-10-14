import { useEffect, useState } from 'react';
import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import './MiningConfigBurningEffect.css';

interface EffectOption {
  id: string;
  name: string;
}

/**
 * What a player or mob that is on fire looks like: one particle effect from the library, drawn on
 * whoever is burning. (How hard fire hurts is on the Environmental Damage card.)
 */
export default function MiningConfigBurningEffect({ config, onFieldChange }: MiningConfigFieldProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [effects, setEffects] = useState<EffectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth('/api/admin/particle-effects')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load particle effects');
        return res.json();
      })
      .then((list: EffectOption[]) => {
        if (!cancelled) setEffects(Array.isArray(list) ? list : []);
      })
      .catch((err) => toast.error(err.message || 'Failed to load particle effects'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = config.burningEffectId ?? '';
  // A saved effect that has since been deleted still shows, so it can be seen and changed
  const known = effects.some((effect) => effect.id === selected);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4" data-testid="burning-effect-config">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🔥</span> Burning Look
        </h3>
        <p className="text-xs text-slate-500">The particle effect drawn on any player or mob that is on fire.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size={28} />
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="burningEffectId" className="text-sm font-semibold text-slate-700">
            Burning Effect
          </label>
          <select
            id="burningEffectId"
            value={selected}
            onChange={(e) => onFieldChange('burningEffectId', e.target.value === '' ? null : e.target.value)}
            className="cursor-pointer w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white hover:border-slate-400"
          >
            <option value="">None (nothing drawn)</option>
            {selected && !known && <option value={selected}>Missing effect ({selected})</option>}
            {effects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400">Pick or edit effects on the Particle Effects page.</p>
        </div>
      )}
    </div>
  );
}
