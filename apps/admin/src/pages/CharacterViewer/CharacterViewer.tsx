import { ModularRigEditor } from '../../components/ModularRigEditor/ModularRigEditor';
import './CharacterViewer.css';

export default function CharacterViewer() {
  return (
    <div className="character-viewer-page">
      <ModularRigEditor target={{ type: 'character' }} showHeader={true} />
    </div>
  );
}
