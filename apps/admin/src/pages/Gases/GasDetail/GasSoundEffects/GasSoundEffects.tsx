import { GAS_SOUND_SLOTS, normalizeGasSoundRefs, type GasDefinition, type GasSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './GasSoundEffects.css';

interface GasSoundEffectsProps {
  /** The saved gas. Sounds are saved straight away, one slot at a time, so the gas must exist. */
  gas: Pick<GasDefinition, 'id' | 'soundEffects'>;
  /** Called with the saved gas after a change. */
  onSaved: (gas: GasDefinition) => void;
}

/**
 * A gas's sounds: walking into it, leaving it, catching fire, exploding, and escaping into the open air. Each slot uses a sound from
 * the shared library (chosen or uploaded through the shared picker) with its own volume.
 */
export default function GasSoundEffects({ gas, onSaved }: GasSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const refs: GasSoundSlotRefs = normalizeGasSoundRefs(gas.soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof GasSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`/api/admin/gases/${gas.id}/sound-effects/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="gas-sound-effects bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="gas-sounds">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Sounds</h4>
        <p className="text-xs text-slate-500 font-medium">
          Pick a sound from the library or upload one. Each sound is saved as soon as you choose it, and its volume is
          set here, for this gas only.
        </p>
      </div>
      <SoundSlotPicker
        slots={GAS_SOUND_SLOTS}
        selections={refs}
        buildRequest={buildRequest}
        onChange={(updated) => onSaved(updated as GasDefinition)}
        entityLabel="gas"
        uploadCategory="GAS"
        testIdPrefix="gas-sound"
      />
    </section>
  );
}
