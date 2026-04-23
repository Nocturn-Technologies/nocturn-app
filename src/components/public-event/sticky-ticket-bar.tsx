"use client";

import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";

interface StickyTicketBarProps {
  lowestPrice: string;
  accentColor: string;
  ticketSectionId: string;
}

export function StickyTicketBar({ lowestPrice, accentColor, ticketSectionId }: StickyTicketBarProps) {
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
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-slide-in-up">
      {/* B20: solid background on the sticky bar. Previously 95% opacity +
          blur let description text bleed through visibly on mobile. */}
      <div className="border-t border-white/5 bg-[#09090B] backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[640px] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Tickets available</p>
            <p className="text-xs text-white/50">From {lowestPrice}</p>
          </div>
          <button
            onClick={scrollToTickets}
            className="flex items-center gap-2 rounded-xl px-5 py-3 min-h-[44px] text-sm font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.95]"
            style={{ backgroundColor: accentColor }}
          >
            <Ticket className="h-4 w-4" />
            Get Tickets
          </button>
        </div>
      </div>
    </div>
  );
}
