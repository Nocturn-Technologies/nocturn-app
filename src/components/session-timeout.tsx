"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 30 min total, warn at 25 min (i.e. 5 min remaining).
// B23: added a live countdown and "Stay signed in" that extends via the
// same reset-timers path. Previously the banner showed a static "5 minutes"
// with no ticking display — easy to miss, and no visible feedback when the
// user clicked Stay signed in.
const TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;
const COUNTDOWN_MS = TIMEOUT_MS - WARNING_MS; // 5 min

export function SessionTimeout() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When the warning fires we expose a countdown (seconds remaining) so the
  // banner has something to tick visibly. null = warning not active.
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?reason=timeout");
  }, [router]);

  const resetTimers = useCallback(() => {
    clearTimers();
    setSecondsRemaining(null);

    warningRef.current = setTimeout(() => {
      // Start the countdown
      let remaining = Math.ceil(COUNTDOWN_MS / 1000);
      setSecondsRemaining(remaining);
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setSecondsRemaining(remaining > 0 ? remaining : 0);
      }, 1000);
    }, WARNING_MS);

    timeoutRef.current = setTimeout(() => {
      signOut();
    }, TIMEOUT_MS);
  }, [clearTimers, signOut]);

  useEffect(() => {
    resetTimers();

    // Debounce activity handler to avoid excessive timer resets
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onActivity = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        resetTimers();
      }, 1000);
    };

    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, onActivity));

    return () => {
      clearTimers();
      if (debounceTimer) clearTimeout(debounceTimer);
      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [resetTimers, clearTimers]);

  if (secondsRemaining === null) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const countdownStr =
    mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      <span>Session expiring in {countdownStr} due to inactivity</span>
      <button
        onClick={resetTimers}
        className="ml-2 rounded bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors min-h-[28px]"
      >
        Stay signed in
      </button>
    </div>
  );
}
