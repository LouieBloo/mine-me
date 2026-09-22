import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemColliderEditor from './ItemColliderEditor';
import type { ItemPhysicsConfig } from '@mine-me/shared';

describe('ItemColliderEditor', () => {
  const dummyItem = {
    id: 'item-1',
    name: 'Standard Pickaxe',
    subType: 'WEAPON',
    iconUrl: '/assets/icons/items/pickaxe.png',
  };

  const dummyDynamite = {
    id: 'cmtz702uk0001nu7bn2tidnx0',
    name: 'Dynamite',
    subType: 'DYNAMITE',
    iconUrl: '/assets/icons/items/dynamite.png',
  };

  const initialRectConfig: ItemPhysicsConfig = {
    hasPhysics: true,
    colliderType: 'RECTANGLE',
    colliderWidth: 10,
    colliderHeight: 22,
    colliderOffsetX: 0,
    colliderOffsetY: 0,
    mass: 1.0,
    friction: 0.4,
    restitution: 0.45,
    gravityScale: 1.0,
    allowRotation: true,
    throwPower: 14.0,
    fuseSeconds: 4.0,
  };

  it('renders collider status badge, zoom options, and shape buttons', () => {
    const handleChange = vi.fn();
    render(
      <ItemColliderEditor
        item={dummyItem}
        physicsConfig={null}
        onChange={handleChange}
      />
    );

    expect(screen.getByText(/2D Collider & Rigid Body Editor/i)).toBeInTheDocument();
    expect(screen.getByText('NO COLLIDER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /None/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Circle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rectangle/i })).toBeInTheDocument();
  });

  it('renders rectangle dimensions and rigid body dynamics when RECTANGLE is active', () => {
    const handleChange = vi.fn();
    render(
      <ItemColliderEditor
        item={dummyItem}
        physicsConfig={initialRectConfig}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('RECTANGLE COLLIDER ACTIVE')).toBeInTheDocument();
    expect(screen.getByLabelText(/Width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Height/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Offset X/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Offset Y/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mass \(kg\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bounciness \(Restitution\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Surface Friction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gravity Scale/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Toggle rotation/i)).toBeInTheDocument();
  });

  it('renders circle dimensions when CIRCLE is selected', () => {
    const handleChange = vi.fn();
    const circleConfig: ItemPhysicsConfig = {
      hasPhysics: true,
      colliderType: 'CIRCLE',
      colliderRadius: 12,
      colliderOffsetX: 2,
      colliderOffsetY: -1,
      mass: 1.5,
    };

    render(
      <ItemColliderEditor
        item={dummyItem}
        physicsConfig={circleConfig}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('CIRCLE COLLIDER ACTIVE')).toBeInTheDocument();
    expect(screen.getByLabelText(/Radius/i)).toBeInTheDocument();
    expect(screen.getByText('12 px')).toBeInTheDocument();
    expect(screen.getByLabelText(/Offset X/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Offset Y/i)).toBeInTheDocument();
  });

  it('conditionally shows dynamite action parameters only when item is DYNAMITE', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <ItemColliderEditor
        item={dummyItem}
        physicsConfig={initialRectConfig}
        onChange={handleChange}
      />
    );

    // Standard pickaxe should NOT show dynamite parameters
    expect(screen.queryByText(/Dynamite Action Parameters/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Throw Power/i)).not.toBeInTheDocument();

    // Rerender with dynamite item
    rerender(
      <ItemColliderEditor
        item={dummyDynamite}
        physicsConfig={initialRectConfig}
        onChange={handleChange}
      />
    );

    // Dynamite should show dynamite parameters
    expect(screen.getByText(/Dynamite Action Parameters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Throw Power/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fuse Duration/i)).toBeInTheDocument();
  });

  it('triggers onChange when switching shape or adjusting sliders', () => {
    const handleChange = vi.fn();
    render(
      <ItemColliderEditor
        item={dummyDynamite}
        physicsConfig={initialRectConfig}
        onChange={handleChange}
      />
    );

    // Switch to circle
    const circleBtn = screen.getByRole('button', { name: /Circle/i });
    fireEvent.click(circleBtn);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        colliderType: 'CIRCLE',
        hasPhysics: true,
      })
    );

    // Change throw power
    const throwPowerSlider = screen.getByLabelText(/Throw Power/i);
    fireEvent.change(throwPowerSlider, { target: { value: '20' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        throwPower: 20,
      })
    );

    // Center reset button
    const centerBtn = screen.getByRole('button', { name: /Center \(0,0\)/i });
    fireEvent.click(centerBtn);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        colliderOffsetX: 0,
        colliderOffsetY: 0,
      })
    );
  });
});
