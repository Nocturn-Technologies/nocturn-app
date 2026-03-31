"use client";

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";

export function EventCreatedToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = sessionStorage.getItem("event-created");
    if (flag) {
      sessionStorage.removeItem("event-created");
      setShow(true);
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center px-4 pt-3 md:pt-4 pointer-events-none animate-slide-down">
      <div className="pointer-events-auto w-full max-w-md">
        <div className="flex items-center gap-3 rounded-2xl border border-green-500/20 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-green-500/10">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <Check className="h-3.5 w-3.5 text-green-400" />
          </div>
          <p className="flex-1 text-sm text-white leading-relaxed">
            Event created! You can now publish it, add a flyer, or set up tickets.
          </p>
          <button
            onClick={() => setShow(false)}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
