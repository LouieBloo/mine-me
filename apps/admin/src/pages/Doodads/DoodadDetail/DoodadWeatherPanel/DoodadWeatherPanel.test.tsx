import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadWeatherPanel from './DoodadWeatherPanel';

describe('DoodadWeatherPanel', () => {
  it('has a box for every weather kind, checked for the ones the doodad hides in', () => {
    render(<DoodadWeatherPanel hiddenInWeather={['storm']} onChange={vi.fn()} />);
    for (const label of ['Clear', 'Cloudy', 'Windy', 'Rain', 'Storm', 'Snow', 'Fog']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText('Storm')).toBeChecked();
    expect(screen.getByLabelText('Rain')).not.toBeChecked();
  });

  it('adds a weather to the list, in the usual order', () => {
    const onChange = vi.fn();
    render(<DoodadWeatherPanel hiddenInWeather={['storm']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Rain'));
    expect(onChange).toHaveBeenCalledWith(['rain', 'storm']);
  });

  it('takes a weather off the list', () => {
    const onChange = vi.fn();
    render(<DoodadWeatherPanel hiddenInWeather={['rain', 'storm']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Rain'));
    expect(onChange).toHaveBeenCalledWith(['storm']);
  });

  it('ends with an empty list when the last one is unchecked', () => {
    const onChange = vi.fn();
    render(<DoodadWeatherPanel hiddenInWeather={['fog']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Fog'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
