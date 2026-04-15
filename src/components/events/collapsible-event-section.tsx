"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { SwipeableEventList } from "./swipeable-event-list";

interface EventItem {
  id: string;
  title: string;
  slug: string;
  starts_at: string;
  status: string;
  flyer_url: string | null;
  venues: { name: string; city: string } | null;
}

interface CollapsibleEventSectionProps {
  title: string;
  events: EventItem[];
  dotColor: string;
  muted?: boolean;
  defaultOpen?: boolean;
}

export function CollapsibleEventSection({
  title,
  events,
  dotColor,
  muted = false,
  defaultOpen = false,
}: CollapsibleEventSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasAnimated, setHasAnimated] = useState(defaultOpen);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (isOpen) {
      const t = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(t);
    }
    setHasAnimated(false);
  }, [isOpen]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 -mx-2 min-h-[44px] group cursor-pointer hover:bg-accent/50 active:scale-[0.98] transition-all duration-200"
      >
        <div className={`h-2 w-2 rounded-full ${dotColor} transition-transform duration-200 group-hover:scale-125`} />
        <h2
          className={`text-lg font-bold font-heading ${muted ? "text-muted-foreground" : ""}`}
        >
          {title}
        </h2>
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums transition-colors duration-200">
          {events.length}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SwipeableEventList events={events} stagger={!defaultOpen && hasAnimated} />
          </div>
        </div>
      </div>
    </div>
  );
}
