import { MOB_SOUND_SLOTS, normalizeMobSoundRefs, type MobSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../components/SoundSlotPicker/SoundSlotPicker';

interface MobSoundEffectsProps {
  /** Null while the mob is unsaved: sounds attach to a saved mob. */
  mobId: string | null;
  soundEffects?: MobSoundSlotRefs | null;
  /** Called with the saved mob after a slot changes. */
  onChange: (updatedMob: any) => void;
}

export default function MobSoundEffects({ mobId, soundEffects, onChange }: MobSoundEffectsProps) {
  const { fetchWithAuth } = useApi();

  if (!mobId) {
    return (
      <p className="text-sm font-medium text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4">
        Save the mob first, then you can choose its sounds.
      </p>
    );
  }

  const refs = normalizeMobSoundRefs(soundEffects);

  const buildRequest = (action: SoundSlotAction) => {
    const url = `/api/admin/mobs/${mobId}/sound-effects/${action.slotKey}`;
    const current = refs[action.slotKey as keyof MobSoundSlotRefs];
    const body = action.kind === 'choose' ? { soundId: action.soundId } : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  return (
    <SoundSlotPicker
      slots={MOB_SOUND_SLOTS}
      selections={refs}
      buildRequest={buildRequest}
      onChange={onChange}
      entityLabel="mob"
      uploadCategory="MOB"
      testIdPrefix="mob-sound"
    />
  );
}
