import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemInGameSpriteUpload from './ItemInGameSpriteUpload';
import '@testing-library/jest-dom';

vi.mock('../../../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn(),
  }),
}));

vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ItemInGameSpriteUpload Component', () => {
  it('renders upload button and empty state when inGameSpriteUrl is missing', () => {
    const onUploadSuccess = vi.fn();
    render(
      <ItemInGameSpriteUpload
        itemId="item-1"
        inGameSpriteUrl={null}
        onUploadSuccess={onUploadSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /In-Game Sprite/i })).toBeInTheDocument();
    expect(screen.getByText(/Upload In-Game Sprite/i)).toBeInTheDocument();
    expect(screen.getByText(/Select PNG \(Max 256x256\)/i)).toBeInTheDocument();
  });

  it('renders sprite preview and update button when inGameSpriteUrl is present', () => {
    const onUploadSuccess = vi.fn();
    render(
      <ItemInGameSpriteUpload
        itemId="item-1"
        inGameSpriteUrl="/assets/sprites/items/item-1_ingame.png"
        onUploadSuccess={onUploadSuccess}
      />
    );

    expect(screen.getByText(/Update Sprite/i)).toBeInTheDocument();
    expect(screen.getByText(/item-1_ingame.png/i)).toBeInTheDocument();
    const img = screen.getByAltText(/In-Game Sprite/i);
    expect(img).toBeInTheDocument();
  });

  it('toggles upload form when Update Sprite is clicked', () => {
    const onUploadSuccess = vi.fn();
    render(
      <ItemInGameSpriteUpload
        itemId="item-1"
        inGameSpriteUrl="/assets/sprites/items/item-1_ingame.png"
        onUploadSuccess={onUploadSuccess}
      />
    );

    const updateBtn = screen.getByRole('button', { name: /Update Sprite/i });
    fireEvent.click(updateBtn);

    expect(screen.getByText(/Upload In-Game Sprite/i)).toBeInTheDocument();
    expect(screen.getByText(/Cancel/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.getByText(/Update Sprite/i)).toBeInTheDocument();
  });
});
