"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * Reads the "event-created" flag from sessionStorage and shows
 * a brief success toast. Clears the flag after showing.
 */
export function EventCreatedToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = sessionStorage.getItem("event-created");
    if (flag === "true") {
      sessionStorage.removeItem("event-created");
      setShow(true);
      const timer = setTimeout(() => setShow(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-fade-in-up">
      <div className="flex items-center gap-2 rounded-full bg-green-500/20 border border-green-500/30 px-4 py-2 shadow-lg backdrop-blur-sm">
        <Check className="h-4 w-4 text-green-400" />
        <span className="text-sm font-medium text-green-300">Event created!</span>
      </div>
    </div>
  );
}
