import React from 'react';
import { WEATHER_IDS, WEATHER_TYPES } from '@mine-me/shared';
import { hintClass, panelClass } from '../panelStyles';

interface DoodadWeatherPanelProps {
  /** The weather kinds the doodad hides in. */
  hiddenInWeather: string[];
  onChange: (hidden: string[]) => void;
}

/**
 * The weather a surface doodad hides in (ticket 135): birds leave the sky in a storm and come back when it clears. It fades out and
 * in, and only means something for doodads standing or flying above the ground.
 */
const DoodadWeatherPanel: React.FC<DoodadWeatherPanelProps> = ({ hiddenInWeather, onChange }) => {
  const toggle = (id: string) => onChange(hiddenInWeather.includes(id) ? hiddenInWeather.filter((w) => w !== id) : WEATHER_IDS.filter((w) => w === id || hiddenInWeather.includes(w)));
  return (
    <div className={panelClass} data-testid="doodad-weather-panel">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Hides In Weather</h4>
        <p className="text-xs text-slate-500 font-medium">For a doodad on the surface (a tree, a bird): the kinds of weather it fades out in. Leave all unchecked to keep it always shown.</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {WEATHER_IDS.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={hiddenInWeather.includes(id)} onChange={() => toggle(id)} className="cursor-pointer" />
            {WEATHER_TYPES[id].label}
          </label>
        ))}
      </div>
      <span className={hintClass}>Underground doodads are never affected by weather.</span>
    </div>
  );
};

export default DoodadWeatherPanel;
