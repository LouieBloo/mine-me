import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { getAssetUrl } from '@mine-me/shared';
import './GameImage.css';

/** Extra attempts after the first failed load. */
export const GAME_IMAGE_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/** URL for a retry attempt: cache-busted so the browser doesn't reuse the failed response. */
export function withRetryParam(url: string, attempt: number): string {
  if (attempt === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
}

export interface GameImageProps {
  /** Asset path (e.g. an item's iconUrl) or absolute URL. */
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Shown when there is no src or every attempt failed. */
  fallback?: ReactNode;
  draggable?: boolean;
  style?: CSSProperties;
}

/**
 * An <img> for game assets that survives transient failures (server restart, dev-proxy race):
 * it resolves the URL with the shared helper and retries with backoff before giving up.
 */
export const GameImage = ({ src, alt, className, fallback = null, draggable, style }: GameImageProps) => {
  const resolved = getAssetUrl(src);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  // A new source starts fresh
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [resolved]);

  // Schedule the next attempt after a failure
  const [pendingRetry, setPendingRetry] = useState(false);
  useEffect(() => {
    if (!pendingRetry) return;
    const timer = setTimeout(() => {
      setPendingRetry(false);
      setAttempt((n) => n + 1);
    }, RETRY_BASE_DELAY_MS * (attempt + 1));
    return () => clearTimeout(timer);
  }, [pendingRetry, attempt]);

  if (!resolved || failed) return <>{fallback}</>;

  const handleError = () => {
    if (attempt >= GAME_IMAGE_MAX_RETRIES) {
      setFailed(true);
    } else {
      setPendingRetry(true);
    }
  };

  return (
    <img
      src={withRetryParam(resolved, attempt)}
      alt={alt}
      className={`${className ?? ''}${pendingRetry ? ' game-image-failed' : ''}`}
      draggable={draggable}
      style={style}
      onError={handleError}
    />
  );
};
