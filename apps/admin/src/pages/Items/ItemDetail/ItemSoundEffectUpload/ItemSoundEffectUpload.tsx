import {
  type ItemSoundProfile,
  type ItemSoundEffectsConfig,
  ItemSoundProfileRegistry,
  WeaponSoundProfile,
} from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, { type SoundSlotAction } from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './ItemSoundEffectUpload.css';

interface ItemSoundEffectUploadProps {
  itemId: string;
  profile?: ItemSoundProfile;
  soundEffects?: ItemSoundEffectsConfig | null;
  soundEffectUrl?: string | null;
  onUploadSuccess: (updatedItem: any) => void;
}

/**
 * An item's sound slots (swing, gunshot, reload, fuse, explosion...). Each slot picks a sound from
 * the library or uploads a new one, exactly like a mob's sound slots (both use SoundSlotPicker).
 */
export default function ItemSoundEffectUpload({
  itemId,
  profile = ItemSoundProfileRegistry.getProfile('WEAPON') || new WeaponSoundProfile(),
  soundEffects,
  soundEffectUrl,
  onUploadSuccess,
}: ItemSoundEffectUploadProps) {
  const { fetchWithAuth } = useApi();

  const slots = profile.getSlots();
  const config = profile.normalizeConfig(soundEffects, soundEffectUrl);

  const buildRequest = (action: SoundSlotAction) => {
    const url = `/api/admin/items/${itemId}/sound-effects/${action.slotKey}`;
    const body = action.kind === 'choose' ? { soundId: action.soundId } : { loop: action.loop };
    return fetchWithAuth(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  return (
    <div className="item-sound-effect-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-6">
      <div className="bg-slate-800 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
            <span>{profile.title}</span>
            <span className="text-amber-400 text-base">🔊</span>
          </h3>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">{profile.description}</p>
        </div>
        <div className="px-3 py-1 bg-white/10 rounded-full border border-white/20 text-xs font-mono text-slate-300 font-bold">
          {slots.length} {slots.length === 1 ? 'Slot' : 'Slots'}
        </div>
      </div>

      <div className="p-8">
        <SoundSlotPicker
          slots={slots}
          selections={config}
          buildRequest={buildRequest}
          onChange={onUploadSuccess}
          entityLabel="item"
          uploadCategory="ITEM"
          testIdPrefix="item-sound"
        />
      </div>
    </div>
  );
}
