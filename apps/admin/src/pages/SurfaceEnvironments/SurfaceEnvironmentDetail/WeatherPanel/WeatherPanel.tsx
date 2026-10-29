import React from 'react';
import { WEATHER_IDS, WEATHER_TYPES, type WeatherId } from '@mine-me/shared';
import { hintClass, panelClass, readNumber, show, smallInputClass } from '../../../Doodads/DoodadDetail/panelStyles';

interface WeatherPanelProps {
  weather: Record<WeatherId, number>;
  onChange: (weather: Record<WeatherId, number>) => void;
}

/** What weather this place gets: a weight for each kind (0 = never). The weather changes slowly between neighbouring kinds, e.g. clear to cloudy to rain to storm. */
const WeatherPanel: React.FC<WeatherPanelProps> = ({ weather, onChange }) => {
  const total = WEATHER_IDS.reduce((sum, id) => sum + (Number.isFinite(weather[id]) && weather[id] > 0 ? weather[id] : 0), 0);
  return (
    <div className={panelClass} data-testid="weather-panel">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Weather</h4>
        <p className="text-xs text-slate-500 font-medium">
          A run starts with one of these and drifts between kinds that are next to each other (clear to cloudy to rain to storm), changing every few minutes. The same for every player. With no weight on any, it is always clear.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {WEATHER_IDS.map((id) => {
          const share = total > 0 && weather[id] > 0 ? Math.round((weather[id] / total) * 100) : 0;
          return (
            <div key={id} className="space-y-1">
              <label htmlFor={`weather-${id}`} className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                {WEATHER_TYPES[id].label}
              </label>
              <input
                id={`weather-${id}`}
                type="number"
                min={0}
                step={0.5}
                value={show(weather[id])}
                onChange={(e) => onChange({ ...weather, [id]: readNumber(e.target.value) })}
                className={smallInputClass}
              />
              <span className={hintClass}>{share}% of the time</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeatherPanel;
