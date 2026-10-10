import { useApi } from '../../../../hooks/useApi';
import SoundSlotPicker, {
  type SoundSlotAction,
  type SoundSlotDefinition,
} from '../../../../components/SoundSlotPicker/SoundSlotPicker';
import './BlockSoundEffectUpload.css';

interface BlockSoundEffectUploadProps {
  blockId: string;
  soundEffectUrl?: string | null;
  blockName?: string;
  onUploadSuccess: (updatedBlock: any) => void;
}

/** A block has one sound: the one that plays while it is mined. */
const BLOCK_SOUND_SLOT: SoundSlotDefinition = {
  slotKey: 'damage',
  label: 'Damage Sound',
  description: 'Plays in-game when this block is damaged or mined',
  icon: '⛏️',
};

/** Picks or uploads the block's mining sound with the same picker items and mobs use. */
export default function BlockSoundEffectUpload({ blockId, soundEffectUrl, onUploadSuccess }: BlockSoundEffectUploadProps) {
  const { fetchWithAuth } = useApi();

  const buildRequest = (action: SoundSlotAction) =>
    fetchWithAuth(`/api/admin/blocks/${blockId}/sound-effect`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundId: action.kind === 'choose' ? action.soundId : null }),
    });

  return (
    <div className="block-sound-effect-upload bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-6">
      <div className="bg-slate-800 p-6">
        <h3 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
          <span>Damage Sound Effect</span>
          <span className="text-amber-400 text-base">🔊</span>
        </h3>
        <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
          Choose a sound from the library or upload a new one
        </p>
      </div>
      <div className="p-8">
        <SoundSlotPicker
          slots={[BLOCK_SOUND_SLOT]}
          selections={{ damage: { url: soundEffectUrl } }}
          buildRequest={buildRequest}
          onChange={onUploadSuccess}
          entityLabel="block"
          uploadCategory="BLOCK"
          testIdPrefix="block-sound"
        />
      </div>
    </div>
  );
}
