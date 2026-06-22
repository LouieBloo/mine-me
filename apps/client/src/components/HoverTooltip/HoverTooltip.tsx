import { useState, useRef, useCallback, useEffect, useLayoutEffect, type ReactNode } from 'react';
import './HoverTooltip.css';

interface HoverTooltipProps {
  /** The content rendered inside the tooltip popup. */
  content: ReactNode;
  /** The trigger element(s) that the user hovers over. */
  children: ReactNode;
  /** Offset in px between the cursor and the tooltip edge. Default 12. */
  offset?: number;
  /** Delay in ms before the tooltip appears. Default 150. */
  showDelay?: number;
  /** Extra CSS classes for the tooltip container. */
  className?: string;
  /** Whether the tooltip is disabled (won't show). */
  disabled?: boolean;
}

const VIEWPORT_PADDING = 8; // px from viewport edge

/**
 * Generic, reusable hover tooltip.
 *
 * Wrap any element with <HoverTooltip content={...}> to get a mouse-tracking
 * popup that automatically repositions to stay within the viewport.
 *
 * Usage:
 * ```tsx
 * <HoverTooltip content={<div>Details here</div>}>
 *   <span>Hover me</span>
 * </HoverTooltip>
 * ```
 */
export const HoverTooltip = ({
  content,
  children,
  offset = 20,
  showDelay = 150,
  className = '',
  disabled = false,
}: HoverTooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: -9999, y: -9999 }); // render offscreen initially
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    clearTimer();
    delayTimerRef.current = setTimeout(() => setVisible(true), showDelay);
  }, [disabled, showDelay, clearTimer]);

  const handleMouseLeave = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    let rect = trigger.getBoundingClientRect();
    // Fallback if trigger has display: contents and returns 0 size
    if (rect.width === 0 && rect.height === 0 && trigger.firstElementChild) {
      rect = trigger.firstElementChild.getBoundingClientRect();
    }

    const tooltipW = tooltip.offsetWidth;
    const tooltipH = tooltip.offsetHeight;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;

    // Centered vertically relative to the trigger (along the horizontal centerline)
    const triggerCenterY = rect.top + rect.height / 2;
    let py = triggerCenterY - tooltipH / 2;

    // Positioned to the left of the trigger
    let px = rect.left - tooltipW - offset;

    // If it overflows the left edge of the screen, flip it to the right of the trigger
    if (px < VIEWPORT_PADDING) {
      if (rect.right + tooltipW + offset + VIEWPORT_PADDING <= vw) {
        px = rect.right + offset;
      } else {
        px = VIEWPORT_PADDING;
      }
    }

    // Clamp vertical position to keep it on screen
    py = Math.max(VIEWPORT_PADDING, Math.min(vh - tooltipH - VIEWPORT_PADDING, py));

    setPosition({ x: px, y: py });
  }, [offset]);

  // Synchronously update position exactly when it mounts or content changes 
  // before the browser paints, preventing flicker or off-screen rendering
  useLayoutEffect(() => {
    if (visible) {
      updatePosition();
    }
  }, [visible, content, updatePosition]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return (
    <div
      ref={triggerRef}
      className="hover-tooltip-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {visible && (
        <div
          ref={tooltipRef}
          className={`hover-tooltip ${className}`}
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
