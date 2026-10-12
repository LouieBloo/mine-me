import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CharacterEditor from './CharacterEditor';
import { ToastProvider } from '../../contexts/ToastContext';

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockApplication {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn(), removeChild: vi.fn() };
    ticker = { add: vi.fn(), remove: vi.fn() };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  }
  class MockContainer {
    children: any[] = [];
    x = 0;
    y = 0;
    rotation = 0;
    scale = { x: 1, y: 1 };
    addChild(c: any) { this.children.push(c); }
    removeChild(c: any) { this.children = this.children.filter((x) => x !== c); }
  }
  class MockSprite {
    anchor = { set: vi.fn() };
    x = 0;
    y = 0;
    rotation = 0;
    visible = true;
    tint = 0xffffff;
  }
  class MockGraphics {
    clear = vi.fn();
    moveTo = vi.fn();
    lineTo = vi.fn();
    stroke = vi.fn();
    circle = vi.fn();
    fill = vi.fn();
    rect = vi.fn();
  }
  return {
    Application: MockApplication,
    Container: MockContainer,
    Sprite: MockSprite,
    Graphics: MockGraphics,
    Texture: { EMPTY: {} },
    Assets: { load: vi.fn().mockResolvedValue({}) },
  };
});

const mockManifest = {
  version: '1.0',
  canvas_size: [1024, 1024],
  pelvis_origin: [512, 590],
  parts: {
    head: {
      file: 'head.png',
      width: 242,
      height: 260,
      bbox: [419, 81, 660, 340],
      pivot_anchor: [0.4174, 0.8808],
      offset_from_pelvis: [8, -280],
      z_index: 30,
      slot: 'HEAD',
    },
    torso: {
      file: 'torso.png',
      width: 281,
      height: 321,
      bbox: [360, 280, 640, 600],
      pivot_anchor: [0.5409, 0.9657],
      offset_from_pelvis: [0, 0],
      z_index: 20,
      slot: 'CHEST',
    },
    arm_front: {
      file: 'arm_front.png',
      width: 159,
      height: 445,
      bbox: [302, 276, 460, 720],
      pivot_anchor: [0.522, 0.1213],
      offset_from_pelvis: [-127, -260],
      z_index: 40,
      slot: 'WEAPON',
    },
  },
};

// One stable fetch function: a new one per render would make the data hooks reload forever
const mockFetchWithAuth = vi.fn(async (url: string) => ({
  ok: true,
  json: () =>
    Promise.resolve(
      url.includes('character-sounds')
        ? { soundEffects: {} }
        : url.includes('/sounds')
          ? []
          : [
              {
                id: 'item_1',
                name: 'Iron Helmet',
                type: 'GEAR',
                subType: 'HEAD',
                gearImageUrl: '/assets/gear/helm.png',
              },
            ]
    ),
}));
vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth: mockFetchWithAuth }),
}));

describe('CharacterEditor Page', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      })
    );
  });

  it('shows the rig editor together with the character sounds panel', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CharacterEditor />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Character Model & Slices...')).toBeNull();
    });
    expect(screen.getByTestId('character-sounds')).toBeDefined();
    expect(screen.getByText('Character Sounds')).toBeDefined();
  });

  it('renders header and parts list after loading', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CharacterEditor />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Character Model & Slices...')).toBeNull();
    });

    expect(screen.getByText('Character Model & Rig Inspector')).toBeDefined();
    expect(screen.getByText('head')).toBeDefined();
    expect(screen.getByText('torso')).toBeDefined();
    expect(screen.getByText('arm front')).toBeDefined();
  });

  it('switches between tabs', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CharacterEditor />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Character Model & Slices...')).toBeNull();
    });

    // Switch to Gear Socket Tester tab
    const gearTabButton = await screen.findByText('Gear Socket Tester');
    fireEvent.click(gearTabButton);

    await waitFor(() => {
      expect(screen.getByText('Joint Socket Gear Attachments')).toBeDefined();
    });

    // Switch to Raw JSON tab
    const jsonTabButton = await screen.findByText('Live Skeleton JSON');
    fireEvent.click(jsonTabButton);

    await waitFor(() => {
      expect(screen.getByText('miner_skeleton.json')).toBeDefined();
    });
  });

  it('allows adjusting part dimensions and offsets live', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CharacterEditor />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Character Model & Slices...')).toBeNull();
    });

    expect(screen.getAllByText(/Save Rig Coordinates/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Adjust Parts & Pivots (3)')).toBeDefined();

    // Check that we can step an offset
    const plusButtons = screen.getAllByRole('button', { name: '+5' });
    expect(plusButtons.length).toBeGreaterThan(0);
    fireEvent.click(plusButtons[0]);
  }, 20000);

  it('allows changing animation states', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CharacterEditor />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Character Model & Slices...')).toBeNull();
    });

    const walkButton = await screen.findByRole('button', { name: /^walk$/i });
    fireEvent.click(walkButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^walk$/i }).className).toContain(
        'bg-slate-900'
      );
    });

    const mineButton = screen.getByRole('button', { name: /^mine$/i });
    fireEvent.click(mineButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^mine$/i }).className).toContain(
        'bg-slate-900'
      );
    });
  }, 20000);
});
