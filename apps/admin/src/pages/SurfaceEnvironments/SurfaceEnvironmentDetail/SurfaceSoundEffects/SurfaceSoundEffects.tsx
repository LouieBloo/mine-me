import { SURFACE_SOUND_SLOTS, normalizeSurfaceSoundRefs, type SurfaceEnvironmentDefinition, type SurfaceSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';

interface SurfaceSoundEffectsProps {
  /** The saved environment. Sounds are saved straight away, one slot at a time, so the environment must exist. */
  environment: Pick<SurfaceEnvironmentDefinition, 'id' | 'soundEffects'>;
  /** Called with the saved environment after a change. */
  onSaved: (environment: SurfaceEnvironmentDefinition) => void;
}

/** An environment's sounds: the rain and wind loops (louder with the weather, fading with depth) and the thunder after a flash. Each uses a library sound with its own volume. */
export default function SurfaceSoundEffects({ environment, onSaved }: SurfaceSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const refs: SurfaceSoundSlotRefs = normalizeSurfaceSoundRefs(environment.soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof SurfaceSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`/api/admin/surface-environments/${environment.id}/sound-effects/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="surface-sounds">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sounds</h4>
        <p className="text-xs text-slate-500 font-medium">
          Pick a sound from the library or upload one. Each sound is saved as soon as you choose it, and its volume is set here, for this place only. The rain and wind loops follow the weather and fade as the player goes underground.
        </p>
      </div>
      <SoundSlotPicker
        slots={SURFACE_SOUND_SLOTS}
        selections={refs}
        buildRequest={buildRequest}
        onChange={(updated) => onSaved(updated as SurfaceEnvironmentDefinition)}
        entityLabel="environment"
        uploadCategory="GENERAL"
        testIdPrefix="surface-sound"
      />
    </section>
  );
}
