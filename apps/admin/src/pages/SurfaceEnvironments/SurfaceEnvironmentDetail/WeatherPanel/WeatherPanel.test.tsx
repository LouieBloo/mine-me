import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WeatherPanel from './WeatherPanel';
import { newEnvironment } from '../../surfaceEnvironmentForm';

describe('WeatherPanel', () => {
  it('has a weight for every weather kind', () => {
    render(<WeatherPanel weather={newEnvironment().weather} onChange={vi.fn()} />);
    for (const label of ['Clear', 'Cloudy', 'Windy', 'Rain', 'Storm', 'Snow', 'Fog']) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it('changes one weight and keeps the others', () => {
    const onChange = vi.fn();
    const weather = newEnvironment().weather;
    render(<WeatherPanel weather={weather} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Storm'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ ...weather, storm: 2 });
  });

  it('shows how much of the time each kind gets', () => {
    render(<WeatherPanel weather={{ ...newEnvironment().weather, clear: 3, cloudy: 1, rain: 0 }} onChange={vi.fn()} />);
    expect(screen.getByText('75% of the time')).toBeInTheDocument();
    expect(screen.getByText('25% of the time')).toBeInTheDocument();
  });

  it('shows 0% for all when nothing has a weight, and copes with an emptied box', () => {
    const onChange = vi.fn();
    const none = { ...newEnvironment().weather, clear: 0, cloudy: 0, rain: 0 };
    render(<WeatherPanel weather={none} onChange={onChange} />);
    expect(screen.getAllByText('0% of the time')).toHaveLength(7);
    fireEvent.change(screen.getByLabelText('Clear'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...none, clear: NaN });
  });
});
