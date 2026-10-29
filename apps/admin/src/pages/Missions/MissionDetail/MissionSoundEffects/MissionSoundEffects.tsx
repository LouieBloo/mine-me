import { MISSION_SOUND_SLOTS, normalizeMissionSoundRefs, type MissionDefinition, type MissionSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './MissionSoundEffects.css';

interface MissionSoundEffectsProps {
  /** The saved mission. Sounds are saved straight away, one slot at a time, so the mission must exist. */
  mission: Pick<MissionDefinition, 'id' | 'soundEffects'>;
  /** Called with the saved mission after a change. */
  onSaved: (mission: MissionDefinition) => void;
}

/** A mission's sounds: one when an objective is done, one for the whole mission, one when it fails. Each uses a library sound with its own volume. */
export default function MissionSoundEffects({ mission, onSaved }: MissionSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const refs: MissionSoundSlotRefs = normalizeMissionSoundRefs(mission.soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof MissionSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`/api/admin/missions/${mission.id}/sound-effects/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="mission-sound-effects bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="mission-sounds">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sounds</h4>
        <p className="text-xs text-slate-500 font-medium">
          Pick a sound from the library or upload one. Each sound is saved as soon as you choose it, and its volume is set here, for this mission only.
        </p>
      </div>
      <SoundSlotPicker
        slots={MISSION_SOUND_SLOTS}
        selections={refs}
        buildRequest={buildRequest}
        onChange={(updated) => onSaved(updated as MissionDefinition)}
        entityLabel="mission"
        uploadCategory="GENERAL"
        testIdPrefix="mission-sound"
      />
    </section>
  );
}
