import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoodadBehaviourPanel from './DoodadBehaviourPanel';
import { DEFAULT_REACTS, DEFAULT_WANDER } from '../../doodadForm';

const effects = [{ id: 'p1', name: 'Spore Cloud' }];
const renderIt = (props: Partial<React.ComponentProps<typeof DoodadBehaviourPanel>> = {}) => {
  const onReactsChange = vi.fn();
  const onWanderChange = vi.fn();
  render(<DoodadBehaviourPanel anchor="FLOOR" reacts={null} wander={null} particleEffects={effects} onReactsChange={onReactsChange} onWanderChange={onWanderChange} {...props} />);
  return { onReactsChange, onWanderChange };
};

describe('DoodadBehaviourPanel', () => {
  it('shows no settings until a behaviour is switched on', () => {
    renderIt();
    expect(screen.queryByLabelText('Strength')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mode')).not.toBeInTheDocument();
  });

  it('switches the reaction on with its defaults and off again', () => {
    const { onReactsChange } = renderIt();
    fireEvent.click(screen.getByLabelText('Reacts to bodies'));
    expect(onReactsChange).toHaveBeenLastCalledWith(DEFAULT_REACTS);
  });

  it('edits the reaction, including its spore puff', () => {
    const { onReactsChange } = renderIt({ reacts: DEFAULT_REACTS });
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '0.9' } });
    expect(onReactsChange).toHaveBeenLastCalledWith({ ...DEFAULT_REACTS, strength: 0.9 });
    fireEvent.change(screen.getByLabelText('Spore Puff'), { target: { value: 'p1' } });
    expect(onReactsChange).toHaveBeenLastCalledWith({ ...DEFAULT_REACTS, puffEffectId: 'p1' });
    fireEvent.change(screen.getByLabelText('Spore Puff'), { target: { value: '' } });
    expect(onReactsChange).toHaveBeenLastCalledWith({ ...DEFAULT_REACTS, puffEffectId: null });
  });

  it('switches wandering on and off', () => {
    const { onWanderChange } = renderIt();
    fireEvent.click(screen.getByLabelText('Wanders'));
    expect(onWanderChange).toHaveBeenLastCalledWith(DEFAULT_WANDER);
  });

  it('starts an air doodad as a flutterer and offers it no other mode', () => {
    const { onWanderChange } = renderIt({ anchor: 'AIR' });
    fireEvent.click(screen.getByLabelText('Wanders'));
    expect(onWanderChange).toHaveBeenLastCalledWith({ ...DEFAULT_WANDER, mode: 'FLUTTER' });
  });

  it('offers crawl, flutter and hop on a surface, and flutter only in the air', () => {
    const { unmount } = render(
      <DoodadBehaviourPanel anchor="FLOOR" reacts={null} wander={DEFAULT_WANDER} particleEffects={[]} onReactsChange={vi.fn()} onWanderChange={vi.fn()} />
    );
    expect(screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['CRAWL', 'FLUTTER', 'HOP']);
    unmount();
    render(<DoodadBehaviourPanel anchor="AIR" reacts={null} wander={{ ...DEFAULT_WANDER, mode: 'FLUTTER' }} particleEffects={[]} onReactsChange={vi.fn()} onWanderChange={vi.fn()} />);
    expect(screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['FLUTTER']);
  });

  it('edits the wander', () => {
    const { onWanderChange } = renderIt({ wander: DEFAULT_WANDER });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'HOP' } });
    expect(onWanderChange).toHaveBeenLastCalledWith({ ...DEFAULT_WANDER, mode: 'HOP' });
    fireEvent.change(screen.getByLabelText('Rests For'), { target: { value: '800' } });
    expect(onWanderChange).toHaveBeenLastCalledWith({ ...DEFAULT_WANDER, pauseMs: 800 });
  });
});
