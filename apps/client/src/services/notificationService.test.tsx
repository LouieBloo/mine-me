import { describe, it, expect, vi } from 'vitest';
import { notificationService } from './notificationService';
import { toast } from 'sonner';

// Mock sonner's toast
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
  },
}));

describe('notificationService', () => {
  it('calls toast.custom for success', () => {
    notificationService.success('Success Title', 'Success Message');
    expect(toast.custom).toHaveBeenCalled();
  });

  it('calls toast.custom for item', () => {
    const mockItem = { 
      id: 'item-1', 
      name: 'Iron Sword', 
      description: 'A simple iron sword.', 
      rarity: 'LOW',
      iconUrl: '/icons/sword.png'
    } as any;
    
    notificationService.item(mockItem);
    expect(toast.custom).toHaveBeenCalled();
  });

  it('calls toast.custom for gold', () => {
    notificationService.gold(100, 'SOL');
    expect(toast.custom).toHaveBeenCalled();
  });
});
