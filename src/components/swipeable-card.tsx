"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
}

const THRESHOLD = 100;
const MAX_SWIPE = 200;

export function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Publish",
  leftLabel = "Archive",
  disabled = false,
}: SwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDragging = useRef(false);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      isDragging.current = true;
      startXRef.current = e.touches[0].clientX;
      currentXRef.current = 0;
      setTransitioning(false);
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || disabled) return;
      const diff = e.touches[0].clientX - startXRef.current;
      // Clamp between -MAX_SWIPE and MAX_SWIPE
      const clamped = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, diff));
      currentXRef.current = clamped;
      setOffset(clamped);
    },
    [disabled]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || disabled) return;
    isDragging.current = false;

    const diff = currentXRef.current;

    if (diff > THRESHOLD && onSwipeRight) {
      onSwipeRight();
    } else if (diff < -THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
    }

    // Spring back
    setTransitioning(true);
    setOffset(0);
  }, [disabled, onSwipeRight, onSwipeLeft]);

  // Compute reveal background opacity based on swipe distance
  const absOffset = Math.abs(offset);
  const revealOpacity = Math.min(absOffset / THRESHOLD, 1);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-lg">
      {/* Reveal background — green on left side (swipe right), red on right side (swipe left) */}
      {offset > 0 && (
        <div
          className="absolute inset-0 flex items-center px-6 rounded-lg"
          style={{
            backgroundColor: `rgba(34, 197, 94, ${revealOpacity * 0.3})`,
          }}
        >
          <span
            className="text-sm font-semibold text-green-400"
            style={{ opacity: revealOpacity }}
          >
            {rightLabel}
          </span>
        </div>
      )}
      {offset < 0 && (
        <div
          className="absolute inset-0 flex items-center justify-end px-6 rounded-lg"
          style={{
            backgroundColor: `rgba(239, 68, 68, ${revealOpacity * 0.3})`,
          }}
        >
          <span
            className="text-sm font-semibold text-red-400"
            style={{ opacity: revealOpacity }}
          >
            {leftLabel}
          </span>
        </div>
      )}

      {/* Card content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: transitioning
            ? "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
