"use client";

import { useEffect, useState } from "react";

interface StickyTicketBarProps {
  lowestPrice: string;
  accentColor: string;
  ticketSectionId: string;
  /** Optional remaining count for live urgency badge ("62 LEFT") */
  remaining?: number;
}

export function StickyTicketBar({ lowestPrice, accentColor, ticketSectionId, remaining }: StickyTicketBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ticketSection = document.getElementById(ticketSectionId);
    if (!ticketSection) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show bar when ticket section is NOT in view
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(ticketSection);
    return () => observer.disconnect();
  }, [ticketSectionId]);

  if (!visible) return null;

  const scrollToTickets = () => {
    const el = document.getElementById(ticketSectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 animate-slide-in-up bg-[#09090B]/95 backdrop-blur-xl"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="px-4 sm:px-10 lg:px-14 h-[52px] flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="brutalist-mono text-[12px] sm:text-[13px] flex items-baseline gap-1.5">
            <span className="text-white/45 text-[10px] tracking-[0.22em] uppercase">FROM</span>
            <span className="text-white font-bold tabular-nums">{lowestPrice}</span>
          </div>
          {typeof remaining === "number" && remaining > 0 && (
            <>
              <span className="text-white/15">·</span>
              <div className="flex items-center gap-1.5 brutalist-mono text-[10.5px] uppercase tracking-[0.22em] text-white/45">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span>{remaining} LEFT</span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={scrollToTickets}
          className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 h-[36px] rounded-[8px] font-heading font-bold text-[12.5px] sm:text-[13px] text-white tracking-[-0.005em] hover:brightness-[1.12] transition-all uppercase"
          style={{ backgroundColor: accentColor }}
        >
          Get tickets
          <span className="text-[15px] leading-none">→</span>
        </button>
      </div>
    </div>
  );
}
