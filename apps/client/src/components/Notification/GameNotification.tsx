import React from 'react';
import './GameNotification.css';

export type NotificationVariant = 'success' | 'error' | 'info' | 'item' | 'gold';

interface GameNotificationProps {
  title: string;
  message?: string;
  iconUrl?: string | null;
  variant?: NotificationVariant;
  rarity?: 'LOW' | 'MEDIUM' | 'RARE' | 'VERY_RARE';
}

/**
 * GameNotification is a custom component used within 'sonner' toasts.
 * It provides a rich, game-themed UI for various types of alerts.
 */
export const GameNotification: React.FC<GameNotificationProps> = ({
  title,
  message,
  iconUrl,
  variant = 'info',
  rarity,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-lear/50 bg-lear/10';
      case 'error':
        return 'border-red-500/50 bg-red-500/10';
      case 'item': {
        switch (rarity) {
          case 'VERY_RARE':
            return 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.3)]';
          case 'RARE':
            return 'border-blue-500/50 bg-blue-500/10';
          case 'MEDIUM':
            return 'border-green-500/50 bg-green-500/10';
          default:
            return 'border-slate-500/50 bg-slate-500/10';
        }
      }
      case 'gold':
        return 'border-sol/50 bg-sol/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
      default:
        return 'border-slate-700/50 bg-slate-800/80';
    }
  };

  const getIcon = () => {
    if (iconUrl) {
      return <img src={iconUrl} alt={title} className="w-10 h-10 object-contain drop-shadow-md" />;
    }
    switch (variant) {
      case 'success':
        return <span className="text-2xl" role="img" aria-label="success">✅</span>;
      case 'error':
        return <span className="text-2xl" role="img" aria-label="error">❌</span>;
      case 'gold':
        return <span className="text-2xl" role="img" aria-label="gold">💰</span>;
      default:
        return <span className="text-2xl" role="img" aria-label="info">🔔</span>;
    }
  };

  return (
    <div className={`notification-container flex items-center p-4 rounded-lg border backdrop-blur-md min-w-[320px] max-w-[400px] pointer-events-auto transition-all duration-300 ${getVariantStyles()}`}>
      <div className="flex-shrink-0 mr-4">
        <div className="notification-icon-wrapper flex items-center justify-center w-12 h-12 rounded-md bg-slate-900/50 border border-white/5">
          {getIcon()}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <h4 className="text-sm font-bold uppercase tracking-wider text-white/90 m-0 truncate">
          {title}
        </h4>
        {message && (
          <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">
            {message}
          </p>
        )}
      </div>
    </div>
  );
};
