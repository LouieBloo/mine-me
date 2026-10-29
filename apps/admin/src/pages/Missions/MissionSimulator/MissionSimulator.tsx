import React, { useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import { hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../Doodads/DoodadDetail/panelStyles';
import './MissionSimulator.css';

interface SimulatedMission {
  id: string;
  key: string;
  name: string;
  tier: number;
  share: number;
  eligible: boolean;
}

/** Share of rolls as a percent, to one decimal. */
export const sharePercent = (share: number): string => `${Math.round(share * 1000) / 10}%`;

/**
 * "Simulate offers": pick a character level and see which missions would be offered, and how often over many rolls
 * (the offer roll takes 2 to 4 distinct missions by weight from those that fit the level).
 */
const MissionSimulator: React.FC = () => {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [level, setLevel] = useState(1);
  const [result, setResult] = useState<SimulatedMission[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!Number.isInteger(level) || level < 1) {
      toast.error('Enter a level of at least 1.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/admin/missions/simulate-offers', { method: 'POST', body: JSON.stringify({ level, rolls: 2000 }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to simulate the offers');
      }
      const data: { missions: SimulatedMission[] } = await res.json();
      setResult(data.missions);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`mission-simulator ${panelClass}`} data-testid="mission-simulator">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Simulate Offers</h4>
        <p className={hintClass}>Pick a character level to see which missions it would be offered, and how often over 2000 rolls.</p>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="sim-level" className={labelClass}>Level</label>
          <input id="sim-level" type="number" min={1} step={1} value={show(level)} onChange={(e) => setLevel(readNumber(e.target.value))} className={`${inputClass} w-28`} />
        </div>
        <button type="button" disabled={busy} onClick={run} className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-lg flex items-center gap-2">
          {busy && <LoadingSpinner size={14} color="inherit" />}
          Simulate
        </button>
      </div>
      {result && (
        result.filter((m) => m.eligible).length === 0 ? (
          <p className="text-sm font-semibold text-amber-700">No mission fits level {level}: that character would start a run with no mission.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-black uppercase text-slate-500 tracking-wider">
                <th className="py-2 pr-4">Mission</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2">Offered in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.filter((m) => m.eligible).map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4 font-bold text-slate-800">{m.name}</td>
                  <td className="py-2 pr-4 text-slate-600 font-semibold">{m.tier}</td>
                  <td className="py-2 text-slate-600 font-semibold">{sharePercent(m.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
};

export default MissionSimulator;
