import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';

import './CityPicker.css';

interface City {
  id: string;
  name: string;
}

interface CityPickerProps {
  currentCityId?: string;
  onCityChange: (cityId: string) => void;
  disabled?: boolean;
}

export const CityPicker: React.FC<CityPickerProps> = ({ currentCityId, onCityChange, disabled }) => {
  const { fetchWithAuth } = useApi();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchWithAuth('/api/game/cities')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch cities');
        return res.json();
      })
      .then(data => {
        if (active) {
          setCities(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('[CityPicker] Error fetching cities:', err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchWithAuth]);

  if (loading) {
    return (
      <select disabled className="city-picker-select disabled">
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      className="city-picker-select pointer-events-auto"
      value={currentCityId || ''}
      onChange={(e) => onCityChange(e.target.value)}
      disabled={disabled}
    >
      <option value="" disabled>Select a city</option>
      {cities.map(city => (
        <option key={city.id} value={city.id}>
          Travel to: {city.name}
        </option>
      ))}
    </select>
  );
};
