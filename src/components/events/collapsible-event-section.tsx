"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 -mx-2 group cursor-pointer hover:bg-accent/50 active:scale-[0.98] transition-all duration-200"
      >
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <h2
          className={`text-lg font-bold ${muted ? "text-muted-foreground" : ""}`}
        >
          {title}
        </h2>
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
          <div className="grid gap-3">
            <SwipeableEventList events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
