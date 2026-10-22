import type { MiningConfigFieldProps } from '../MiningConfigTypes';
import AutotilePanel from '../../../../components/AutotilePanel/AutotilePanel';
import './MiningConfigAutotile.css';

/**
 * The default edge look of every terrain block (corner radius and rim). A block can override single fields on its
 * own page.
 */
export default function MiningConfigAutotile({ config, onFieldChange }: MiningConfigFieldProps) {
  return (
    <div className="mining-config-autotile" data-testid="autotile-config">
      <AutotilePanel
        value={config.autotileStyle ?? null}
        onChange={(value) => onFieldChange('autotileStyle', value)}
        title="Terrain Edge Look"
        description="Rounded corners and a rim where terrain meets open space. Each block can override this on its own page."
        inheritLabel="Built-in look"
      />
    </div>
  );
}
