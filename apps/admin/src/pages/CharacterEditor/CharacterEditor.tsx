import { ModularRigEditor } from '../../components/ModularRigEditor/ModularRigEditor';
import CharacterSoundEffects from './CharacterSoundEffects/CharacterSoundEffects';
import './CharacterEditor.css';

export default function CharacterEditor() {
  return (
    <div className="character-editor-page space-y-6">
      <ModularRigEditor target={{ type: 'character' }} showHeader={true} />
      <CharacterSoundEffects />
    </div>
  );
}
