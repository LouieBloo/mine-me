import React, { useEffect, useState } from 'react';
import { useApi } from '../../../../hooks/useApi';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { hintClass, panelClass } from '../../../Doodads/DoodadDetail/panelStyles';
import type { MissionForm } from '../../missionForm';
import { formToMission } from '../../missionForm';
import './MissionRequirements.css';

interface Preview {
  errors: string[];
  labels: string[];
  lines: string[];
}

interface MissionRequirementsProps {
  form: MissionForm;
  /** How long to wait after the last edit before asking the server. */
  delayMs?: number;
}

/**
 * What the map will be made to hold so the mission can be done (ticket 110), written out, plus the sentence each objective
 * becomes for the player. Read-only: it asks the server, which knows the content tables, a moment after the objectives stop changing.
 */
const MissionRequirements: React.FC<MissionRequirementsProps> = ({ form, delayMs = 400 }) => {
  const { fetchWithAuth } = useApi();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const objectivesKey = JSON.stringify(form.objectives);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetchWithAuth('/api/admin/missions/preview', { method: 'POST', body: JSON.stringify({ objectives: formToMission(form).objectives }) });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to check the objectives');
        }
        const data: Preview = await res.json();
        if (active) setPreview(data);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to check the objectives');
      } finally {
        if (active) setBusy(false);
      }
    }, delayMs);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [objectivesKey]);

  return (
    <section className={`mission-requirements ${panelClass}`} data-testid="mission-requirements">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">What the Map Will Hold</h4>
          <p className={hintClass}>The generator guarantees this on every map made for the mission, so it can always be completed. Nothing to set here.</p>
        </div>
        {busy && <LoadingSpinner size={20} />}
      </div>
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold">{error}</div>
      )}
      {preview && (
        <>
          {preview.labels.length > 0 && (
            <ul className="text-sm text-slate-700 font-semibold list-disc pl-5" aria-label="As the player reads it">
              {preview.labels.map((label, i) => (
                <li key={`${label}-${i}`}>{label}</li>
              ))}
            </ul>
          )}
          {preview.lines.length > 0 ? (
            <ul className="text-xs text-slate-500 font-medium list-disc pl-5 space-y-1" aria-label="Map guarantees">
              {preview.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            !busy && <p className="text-xs text-slate-400 font-semibold italic">These objectives ask nothing special of the map.</p>
          )}
        </>
      )}
    </section>
  );
};

export default MissionRequirements;
