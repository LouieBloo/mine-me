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
  offset = 12,
  showDelay = 150,
  className = '',
  disabled = false,
}: HoverTooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: -9999, y: -9999 }); // render offscreen initially
  const tooltipRef = useRef<HTMLDivElement>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  const clearTimer = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    mouseRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    delayTimerRef.current = setTimeout(() => setVisible(true), showDelay);
  }, [disabled, showDelay, clearTimer]);

  const handleMouseLeave = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const updatePosition = useCallback(() => {
    const tooltip = tooltipRef.current;
    const tooltipW = tooltip?.offsetWidth ?? 0;
    const tooltipH = tooltip?.offsetHeight ?? 0;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;

    let { x, y } = mouseRef.current;

    // Default: right and below the cursor
    let px = x + offset;
    let py = y + offset;

    // If we know the width and it overflows right edge, flip to the left of the cursor
    if (tooltipW > 0 && px + tooltipW + VIEWPORT_PADDING > vw) {
      px = x - tooltipW - offset;
    }

    // If we know the height and it overflows bottom edge, flip above the cursor
    if (tooltipH > 0 && py + tooltipH + VIEWPORT_PADDING > vh) {
      py = y - tooltipH - offset;
    }

    // Clamp to never go off left or top
    px = Math.max(VIEWPORT_PADDING, px);
    py = Math.max(VIEWPORT_PADDING, py);

    setPosition({ x: px, y: py });
  }, [offset]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      mouseRef.current = { x: e.clientX, y: e.clientY };
      // Always update position on mouse move so it tracks
      updatePosition();
    },
    [disabled, updatePosition]
  );

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
      className="hover-tooltip-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
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
