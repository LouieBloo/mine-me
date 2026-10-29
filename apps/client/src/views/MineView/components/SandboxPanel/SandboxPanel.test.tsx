import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { SandboxPanel, type SandboxPanelProps } from './SandboxPanel';

const props = (over: Partial<SandboxPanelProps> = {}): SandboxPanelProps => ({
  fluids: [{ typeKey: 'OIL', name: 'Oil' }, { typeKey: 'WATER', name: 'Water' }],
  gases: [{ typeKey: 'HYDROGEN', name: 'Hydrogen' }, { typeKey: 'NITROGEN', name: 'Nitrogen' }],
  mobs: [{ id: 'm1', name: 'Mole Person' }, { id: 'm2', name: 'Target Dummy' }],
  tool: { kind: 'mine' },
  onToolChange: vi.fn(),
  freeCamera: false,
  onFreeCameraChange: vi.fn(),
  status: { godMode: false, paused: false, speed: 1 },
  onGodMode: vi.fn(),
  onPausedChange: vi.fn(),
  onStep: vi.fn(),
  onSpeedChange: vi.fn(),
  onClearHazards: vi.fn(),
  onReset: vi.fn(),
  onLeave: vi.fn(),
  ...over,
});

describe('SandboxPanel', () => {
  it('picks the pour tool with the chosen fluid', () => {
    const p = props();
    render(<SandboxPanel {...p} />);
    fireEvent.change(screen.getByLabelText('Fluid to pour'), { target: { value: 'WATER' } });
    expect(p.onToolChange).not.toHaveBeenCalled(); // choosing a fluid does not switch tools by itself
    fireEvent.click(screen.getByText('Pour fluid'));
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'pour', fluidKey: 'WATER' });
  });

  it('changes the fluid being poured when the pour tool is already active', () => {
    const p = props({ tool: { kind: 'pour', fluidKey: 'OIL' } });
    render(<SandboxPanel {...p} />);
    fireEvent.change(screen.getByLabelText('Fluid to pour'), { target: { value: 'WATER' } });
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'pour', fluidKey: 'WATER' });
  });

  it('picks the release-gas tool with the chosen gas', () => {
    const p = props();
    render(<SandboxPanel {...p} />);
    expect(screen.getByRole('option', { name: 'Hydrogen' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Gas to release'), { target: { value: 'NITROGEN' } });
    expect(p.onToolChange).not.toHaveBeenCalled(); // choosing a gas does not switch tools by itself
    fireEvent.click(screen.getByText('Release gas'));
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'releaseGas', gasKey: 'NITROGEN' });
  });

  it('changes the gas being released when the gas tool is already active', () => {
    const p = props({ tool: { kind: 'releaseGas', gasKey: 'HYDROGEN' } });
    render(<SandboxPanel {...p} />);
    fireEvent.change(screen.getByLabelText('Gas to release'), { target: { value: 'NITROGEN' } });
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'releaseGas', gasKey: 'NITROGEN' });
  });

  it('disables the gas tool, and hides its picker, when the room has no gases (or the camera is free)', () => {
    const { unmount } = render(<SandboxPanel {...props({ gases: [] })} />);
    expect(screen.getByText('Release gas')).toBeDisabled();
    expect(screen.queryByLabelText('Gas to release')).not.toBeInTheDocument();
    unmount();
    render(<SandboxPanel {...props({ freeCamera: true })} />);
    expect(screen.getByText('Release gas')).toBeDisabled();
  });

  it('works without a gas list at all (older sessions)', () => {
    const p = props();
    delete (p as Partial<SandboxPanelProps>).gases;
    render(<SandboxPanel {...p} />);
    expect(screen.getByText('Release gas')).toBeDisabled();
  });

  it('lists every mob and spawns the chosen one', () => {
    const p = props();
    render(<SandboxPanel {...p} />);
    expect(screen.getByRole('option', { name: 'Mole Person' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Target Dummy' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mob to spawn'), { target: { value: 'm2' } });
    fireEvent.click(screen.getByText('Spawn mob'));
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'spawn', mobId: 'm2' });
  });

  it('selects the light-fire and normal tools', () => {
    const p = props({ tool: { kind: 'ignite' } });
    render(<SandboxPanel {...p} />);
    fireEvent.click(screen.getByText('Normal'));
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'mine' });
    fireEvent.click(screen.getByText('Light fire'));
    expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'ignite' });
  });

  it('marks the active tool', () => {
    render(<SandboxPanel {...props({ tool: { kind: 'ignite' } })} />);
    expect(screen.getByText('Light fire').className).toContain('bg-violet-600');
    expect(screen.getByText('Normal').className).not.toContain('bg-violet-600');
  });

  it('turns the free camera on and off, and locks the tools while it is on', () => {
    const p = props();
    const { rerender } = render(<SandboxPanel {...p} />);
    fireEvent.click(screen.getByText('Free camera'));
    expect(p.onFreeCameraChange).toHaveBeenCalledWith(true);

    rerender(<SandboxPanel {...p} freeCamera />);
    expect(screen.getByText('Free camera on')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Pour fluid')).toBeDisabled();
    expect(screen.getByText('Spawn mob')).toBeDisabled();
    fireEvent.click(screen.getByText('Free camera on'));
    expect(p.onFreeCameraChange).toHaveBeenCalledWith(false);
  });

  it('pauses, resumes, steps and changes the speed of the simulation', () => {
    const p = props();
    const { rerender } = render(<SandboxPanel {...p} />);
    expect(screen.getByText('Step')).toBeDisabled(); // only while paused
    fireEvent.click(screen.getByText('Pause'));
    expect(p.onPausedChange).toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText('Simulation speed'), { target: { value: '4' } });
    expect(p.onSpeedChange).toHaveBeenCalledWith(4);

    rerender(<SandboxPanel {...p} status={{ godMode: false, paused: true, speed: 0.5 }} />);
    expect(screen.getByLabelText('Simulation speed')).toHaveValue('0.5');
    fireEvent.click(screen.getByText('Step'));
    expect(p.onStep).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Resume'));
    expect(p.onPausedChange).toHaveBeenCalledWith(false);
  });

  it('toggles god mode, clears hazards, resets and leaves', () => {
    const p = props();
    render(<SandboxPanel {...p} />);
    fireEvent.click(screen.getByText('God mode'));
    expect(p.onGodMode).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText('Clear fluid, gas and fire'));
    expect(p.onClearHazards).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Reset sandbox'));
    expect(p.onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Leave sandbox'));
    expect(p.onLeave).toHaveBeenCalled();
  });

  it('shows the shared spinner and holds the buttons while a command is running', () => {
    render(<SandboxPanel {...props({ busy: true })} />);
    expect(screen.getByTestId('sandbox-busy')).toBeInTheDocument();
    expect(screen.getByText('Reset sandbox')).toBeDisabled();
    expect(screen.getByText('God mode')).toBeDisabled();
  });

  it('has no spinner when idle', () => {
    render(<SandboxPanel {...props()} />);
    expect(screen.queryByTestId('sandbox-busy')).not.toBeInTheDocument();
  });

  it('copes with no fluids or mobs loaded', () => {
    render(<SandboxPanel {...props({ fluids: [], mobs: [] })} />);
    expect(screen.getByText('Pour fluid')).toBeDisabled();
    expect(screen.getByText('Spawn mob')).toBeDisabled();
    expect(screen.queryByLabelText('Fluid to pour')).not.toBeInTheDocument();
  });

  it('collapses out of the way', () => {
    render(<SandboxPanel {...props()} />);
    fireEvent.click(screen.getByText('🧪 Sandbox'));
    expect(screen.queryByText('Reset sandbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('🧪 Sandbox'));
    expect(screen.getByText('Reset sandbox')).toBeInTheDocument();
  });
});

describe('SandboxPanel extractor tools', () => {
  const tools = () => ({
    scenes: [{ id: 'belt-blocked-by-fluid', name: 'Belt blocked by fluid' }, { id: 'full-pack-at-belt', name: 'Full pack at the belt' }],
    onSpawn: vi.fn(),
    onDigBelt: vi.fn(),
    onSetCapacity: vi.fn(),
    onFillBackpack: vi.fn(),
    onLoadScene: vi.fn(),
  });

  it('is hidden when the room has no extractor tools', () => {
    render(<SandboxPanel {...props()} />);
    expect(screen.queryByRole('region', { name: 'Extractor' })).not.toBeInTheDocument();
  });

  it('spawns the extractor, digs the belt, fills the pack and sets the capacity', () => {
    const extractor = tools();
    render(<SandboxPanel {...props({ extractor })} />);
    fireEvent.click(screen.getByText('Spawn extractor'));
    expect(extractor.onSpawn).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Dig belt +10'));
    expect(extractor.onDigBelt).toHaveBeenLastCalledWith(10);
    fireEvent.click(screen.getByText('Dig belt to end'));
    expect(extractor.onDigBelt).toHaveBeenLastCalledWith(100);
    fireEvent.click(screen.getByText('Fill pack'));
    expect(extractor.onFillBackpack).toHaveBeenCalledWith(50);
    fireEvent.change(screen.getByLabelText('Carry capacity'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Set'));
    expect(extractor.onSetCapacity).toHaveBeenCalledWith(250);
  });

  it('will not set a capacity that is empty or negative', () => {
    render(<SandboxPanel {...props({ extractor: tools() })} />);
    const set = screen.getByText('Set');
    fireEvent.change(screen.getByLabelText('Carry capacity'), { target: { value: '' } });
    expect(set).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Carry capacity'), { target: { value: '-5' } });
    expect(set).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Carry capacity'), { target: { value: '0' } });
    expect(set).toBeEnabled();
  });

  it('loads the chosen scene, and not before one is chosen', () => {
    const extractor = tools();
    render(<SandboxPanel {...props({ extractor })} />);
    expect(screen.getByText('Load')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Extractor scene'), { target: { value: 'full-pack-at-belt' } });
    fireEvent.click(screen.getByText('Load'));
    expect(extractor.onLoadScene).toHaveBeenCalledWith('full-pack-at-belt');
  });

  it('waits while a command is running', () => {
    render(<SandboxPanel {...props({ extractor: tools(), busy: true })} />);
    expect(screen.getByText('Spawn extractor')).toBeDisabled();
    expect(screen.getByText('Dig belt +10')).toBeDisabled();
  });
  describe('missions (ticket 116)', () => {
    const missionTools = (over: Partial<NonNullable<SandboxPanelProps['missions']>> = {}) => ({
      options: [{ id: 'm1', name: 'Copper Run (tier 1)' }],
      scenes: [{ id: 'reach-depth', name: 'Reach a depth' }],
      active: false,
      onStart: vi.fn(),
      onControl: vi.fn(),
      onLoadScene: vi.fn(),
      ...over,
    });

    it('hides the mission tools when there are no missions and no scenes', () => {
      render(<SandboxPanel {...props({ missions: missionTools({ options: [], scenes: [] }) })} />);
      expect(screen.queryByLabelText('Missions')).toBeNull();
    });

    it('starts the chosen mission, and cannot start before one is chosen', () => {
      const missions = missionTools();
      render(<SandboxPanel {...props({ missions })} />);
      const start = screen.getByRole('button', { name: 'Start' });
      expect(start).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Mission to start'), { target: { value: 'm1' } });
      fireEvent.click(start);
      expect(missions.onStart).toHaveBeenCalledWith('m1');
    });

    it('finishes, restarts and drops a running mission, and disables them when none runs', () => {
      const idle = missionTools();
      const { rerender } = render(<SandboxPanel {...props({ missions: idle })} />);
      for (const name of ['Finish', 'Restart', 'Drop']) expect(screen.getByRole('button', { name })).toBeDisabled();
      const onControl = vi.fn();
      const running = missionTools({ active: true, onControl });
      rerender(<SandboxPanel {...props({ missions: running })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
      fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
      expect(onControl.mock.calls.map((c) => c[0])).toEqual(['complete', 'reset', 'clear']);
    });

    it('loads a test scene', () => {
      const missions = missionTools();
      render(<SandboxPanel {...props({ missions })} />);
      fireEvent.change(screen.getByLabelText('Mission scene'), { target: { value: 'reach-depth' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Load' }).pop()!);
      expect(missions.onLoadScene).toHaveBeenCalledWith('reach-depth');
    });
  });

  describe('doodads', () => {
    const doodadTools = (over: Partial<NonNullable<SandboxPanelProps['doodads']>> = {}) => ({
      options: [{ id: 'd1', name: 'Mushroom', anchor: 'FLOOR' }, { id: 'd2', name: 'Drip', anchor: 'CEILING' }],
      scenes: [{ id: 'floor-row', name: 'Floor row' }],
      generated: false,
      onSetGeneration: vi.fn(),
      onClear: vi.fn(),
      onLoadScene: vi.fn(),
      ...over,
    });

    it('hides the doodad tools when the room has no doodads', () => {
      render(<SandboxPanel {...props()} />);
      expect(screen.queryByText('Place doodad')).toBeNull();
      expect(screen.queryByLabelText('Doodad to place')).toBeNull();
      render(<SandboxPanel {...props({ doodads: doodadTools({ options: [] }) })} />);
      expect(screen.queryByText('Place doodad')).toBeNull();
    });

    it('picks the place tool with the chosen doodad, and follows a change of doodad while it is active', () => {
      const p = props({ doodads: doodadTools() });
      const { rerender } = render(<SandboxPanel {...p} />);
      fireEvent.change(screen.getByLabelText('Doodad to place'), { target: { value: 'd2' } });
      expect(p.onToolChange).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Place doodad'));
      expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'placeDoodad', doodadId: 'd2' });
      const active = props({ doodads: doodadTools(), tool: { kind: 'placeDoodad', doodadId: 'd2' } });
      rerender(<SandboxPanel {...active} />);
      fireEvent.change(screen.getByLabelText('Doodad to place'), { target: { value: 'd1' } });
      expect(active.onToolChange).toHaveBeenCalledWith({ kind: 'placeDoodad', doodadId: 'd1' });
    });

    it('picks the hit tool (ticket 143), and turns it off while the camera is free', () => {
      const p = props({ doodads: doodadTools() });
      const { rerender } = render(<SandboxPanel {...p} />);
      fireEvent.click(screen.getByText('Hit doodad'));
      expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'hitDoodad' });
      rerender(<SandboxPanel {...props({ doodads: doodadTools(), freeCamera: true })} />);
      expect(screen.getByText('Hit doodad')).toBeDisabled();
    });

    it('picks the remove tool, and turns off both while the camera is free', () => {
      const p = props({ doodads: doodadTools() });
      const { rerender } = render(<SandboxPanel {...p} />);
      fireEvent.click(screen.getByText('Remove doodad'));
      expect(p.onToolChange).toHaveBeenCalledWith({ kind: 'removeDoodad' });
      rerender(<SandboxPanel {...props({ doodads: doodadTools(), freeCamera: true })} />);
      expect(screen.getByText('Place doodad')).toBeDisabled();
      expect(screen.getByText('Remove doodad')).toBeDisabled();
    });

    it('toggles the generator pass, removes all, and loads a scene only once one is chosen', () => {
      const tools = doodadTools();
      render(<SandboxPanel {...props({ doodads: tools })} />);
      fireEvent.click(screen.getByText('Generate doodads'));
      expect(tools.onSetGeneration).toHaveBeenCalledWith(true);
      fireEvent.click(screen.getByText('Remove all doodads'));
      expect(tools.onClear).toHaveBeenCalled();
      const load = screen.getAllByText('Load').at(-1)!;
      expect(load).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Doodad scene'), { target: { value: 'floor-row' } });
      expect(load).not.toBeDisabled();
      fireEvent.click(load);
      expect(tools.onLoadScene).toHaveBeenCalledWith('floor-row');
    });

    it('shows the generator as on, and turns it off', () => {
      const tools = doodadTools({ generated: true });
      render(<SandboxPanel {...props({ doodads: tools })} />);
      expect(screen.getByText('Generated doodads on')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByText('Generated doodads on'));
      expect(tools.onSetGeneration).toHaveBeenCalledWith(false);
    });
  });
});
