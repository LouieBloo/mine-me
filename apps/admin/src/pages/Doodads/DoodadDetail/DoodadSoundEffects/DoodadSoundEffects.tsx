import { DOODAD_SOUND_SLOTS, normalizeDoodadSoundRefs, type DoodadDefinition, type DoodadSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './DoodadSoundEffects.css';

interface DoodadSoundEffectsProps {
  /** The saved doodad. Sounds are saved straight away, one slot at a time, so the doodad must exist. */
  doodad: Pick<DoodadDefinition, 'id' | 'soundEffects'>;
  /** Called with the saved doodad after a change. */
  onSaved: (doodad: DoodadDefinition) => void;
}

/**
 * A doodad's sounds: an ambient sound while it is near, one when a body brushes it, one when it breaks. Each slot uses a sound
 * from the shared library (chosen or uploaded through the shared picker) with its own volume.
 */
export default function DoodadSoundEffects({ doodad, onSaved }: DoodadSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const refs: DoodadSoundSlotRefs = normalizeDoodadSoundRefs(doodad.soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof DoodadSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`/api/admin/doodads/${doodad.id}/sound-effects/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="doodad-sound-effects bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="doodad-sounds">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sounds</h4>
        <p className="text-xs text-slate-500 font-medium">
          Pick a sound from the library or upload one. Each sound is saved as soon as you choose it, and its volume is set here, for this doodad only.
        </p>
      </div>
      <SoundSlotPicker
        slots={DOODAD_SOUND_SLOTS}
        selections={refs}
        buildRequest={buildRequest}
        onChange={(updated) => onSaved(updated as DoodadDefinition)}
        entityLabel="doodad"
        uploadCategory="GENERAL"
        testIdPrefix="doodad-sound"
      />
    </section>
  );
}
