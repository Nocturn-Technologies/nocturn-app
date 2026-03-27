"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000; // 25 minutes

export function SessionTimeout() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningBannerRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const hideWarning = useCallback(() => {
    if (warningBannerRef.current) {
      warningBannerRef.current.style.display = "none";
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?reason=timeout");
  }, [router]);

  const resetTimers = useCallback(() => {
    clearTimers();
    hideWarning();

    warningRef.current = setTimeout(() => {
      if (warningBannerRef.current) {
        warningBannerRef.current.style.display = "flex";
      }
    }, WARNING_MS);

    timeoutRef.current = setTimeout(() => {
      signOut();
    }, TIMEOUT_MS);
  }, [clearTimers, hideWarning, signOut]);

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

  return (
    <div
      ref={warningBannerRef}
      style={{ display: "none" }}
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-600 px-4 py-2 text-sm font-medium text-white"
    >
      <span>Session expiring in 5 minutes due to inactivity</span>
      <button
        onClick={resetTimers}
        className="ml-2 rounded bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        Stay signed in
      </button>
    </div>
  );
}
