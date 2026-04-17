import { toast } from 'sonner';
import { GameNotification } from '../components/Notification/GameNotification';
import type { NotificationVariant } from '../components/Notification/GameNotification';
import type { GameItem } from '@nvg/shared';

/**
 * NotificationService provides a centralized way to trigger rich notifications
 * across the client application. It wraps 'sonner' to provide game-specific
 * notification types like items and gold.
 */
class NotificationService {
  /**
   * Internal helper to show a custom toast with our GameNotification component.
   */
  private show(
    title: string,
    message?: string,
    variant: NotificationVariant = 'info',
    iconUrl?: string | null,
    rarity?: any
  ) {
    toast.custom(() => (
      <GameNotification 
        title={title}
        message={message}
        variant={variant}
        iconUrl={iconUrl}
        rarity={rarity}
      />
    ), {
      duration: 5000,
    });
  }

  /**
   * Show a success notification (e.g., "Quest Completed").
   */
  success(title: string, message?: string) {
    this.show(title, message, 'success');
  }

  /**
   * Show an error notification (e.g., "Not enough gold").
   */
  error(title: string, message?: string) {
    this.show(title, message, 'error');
  }

  /**
   * Show a general info notification.
   */
  info(title: string, message?: string) {
    this.show(title, message, 'info');
  }

  /**
   * Show a notification for receiving an item.
   */
  item(item: GameItem, quantity: number = 1) {
    const title = quantity > 1 ? `${quantity}x ${item.name}` : item.name;
    const message = item.description || `You received ${item.name}!`;
    this.show(title, message, 'item', item.iconUrl, item.rarity);
  }

  /**
   * Show a notification for receiving gold (Sol or Lear).
   */
  gold(amount: number, type: 'SOL' | 'LEAR' = 'SOL') {
    const title = `${amount > 0 ? '+' : ''}${amount} ${type}`;
    const message = `You ${amount > 0 ? 'gained' : 'lost'} ${Math.abs(amount)} ${type.toLowerCase()}.`;
    this.show(title, message, 'gold');
  }
}

export const notificationService = new NotificationService();
export default notificationService;
