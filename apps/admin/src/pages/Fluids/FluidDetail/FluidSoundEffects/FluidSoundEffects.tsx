import { FLUID_SOUND_SLOTS, normalizeFluidSoundRefs, type FluidDefinition, type FluidSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './FluidSoundEffects.css';

interface FluidSoundEffectsProps {
  /** The saved fluid. Sounds are saved straight away, one slot at a time, so the fluid must exist. */
  fluid: Pick<FluidDefinition, 'id' | 'soundEffects'>;
  /** Called with the saved fluid after a change. */
  onSaved: (fluid: FluidDefinition) => void;
}

/**
 * A fluid's sounds: wading in, wading out, catching fire, and the burning loop. Each slot uses a sound from
 * the shared library (chosen or uploaded through the shared picker) with its own volume.
 */
export default function FluidSoundEffects({ fluid, onSaved }: FluidSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const refs: FluidSoundSlotRefs = normalizeFluidSoundRefs(fluid.soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof FluidSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`/api/admin/fluids/${fluid.id}/sound-effects/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="fluid-sound-effects bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="fluid-sounds">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sounds</h4>
        <p className="text-xs text-slate-500 font-medium">
          Pick a sound from the library or upload one. Each sound is saved as soon as you choose it, and its volume is
          set here, for this fluid only.
        </p>
      </div>
      <SoundSlotPicker
        slots={FLUID_SOUND_SLOTS}
        selections={refs}
        buildRequest={buildRequest}
        onChange={(updated) => onSaved(updated as FluidDefinition)}
        entityLabel="fluid"
        uploadCategory="FLUID"
        testIdPrefix="fluid-sound"
      />
    </section>
  );
}
