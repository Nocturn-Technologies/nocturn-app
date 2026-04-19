"use client";

import { useState } from "react";
import { Calendar, MapPin, Ticket, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  type EventTemplate,
  type VibeKey,
  getTemplatesForVibe,
  generateEventTitle,
  getNextSaturday,
} from "@/lib/event-templates";

export interface EventCardData {
  title: string;
  date: Date;
  venue: string;
  tierName: string;
  tierPrice: number;
  templateId: string;
}

interface EventCardProps {
  collectiveName: string;
  vibe: VibeKey;
  data: EventCardData;
  onChange: (data: EventCardData) => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function EventCard({ collectiveName, vibe, data, onChange }: EventCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const templates = getTemplatesForVibe(vibe);

  function selectTemplate(template: EventTemplate) {
    const nextSat = getNextSaturday(template.defaultDoorTime);
    const tier = template.suggestedTiers[0];
    onChange({
      title: generateEventTitle(template, collectiveName),
      date: nextSat,
      venue: "",
      tierName: tier?.name ?? "General Admission",
      tierPrice: tier?.price ?? 25,
      templateId: template.id,
    });
    setEditingField(null);
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="space-y-3">
        <div className="section-label-mono">03 / FIRST NIGHT</div>
        <h2 className="text-3xl md:text-4xl font-bold font-heading tracking-[-0.025em] leading-[1.05]">
          Throw your<br/>first night.
        </h2>
        <p className="text-sm text-muted-foreground">
          Edit anything below, or pick a different template.
        </p>
      </div>

      {/* Main event card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 space-y-4">
          {/* Title */}
          {editingField === "title" ? (
            <Input
              value={data.title}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
              autoFocus
              className="text-lg font-bold"
            />
          ) : (
            <button
              onClick={() => setEditingField("title")}
              className="flex items-center gap-2 group text-left w-full"
            >
              <h3 className="text-lg font-bold text-white">{data.title}</h3>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}

          <div className="h-px bg-border" />

          {/* Date */}
          {editingField === "date" ? (
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-nocturn shrink-0" />
              <input
                type="datetime-local"
                value={(() => {
                  const d = data.date;
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  const hours = String(d.getHours()).padStart(2, "0");
                  const minutes = String(d.getMinutes()).padStart(2, "0");
                  return `${year}-${month}-${day}T${hours}:${minutes}`;
                })()}
                onChange={(e) => {
                  const newDate = new Date(e.target.value);
                  if (!isNaN(newDate.getTime())) {
                    onChange({ ...data, date: newDate });
                  }
                }}
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                autoFocus
                className="flex-1 rounded-md border border-border bg-card px-3 py-1 text-base md:text-sm text-foreground focus:border-nocturn focus:ring-1 focus:ring-nocturn outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingField("date")}
              className="flex items-center gap-3 text-sm group"
            >
              <Calendar className="h-4 w-4 text-nocturn shrink-0" />
              <span className="text-muted-foreground">
                {formatDate(data.date)} · {formatTime(data.date)}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* Venue */}
          {editingField === "venue" ? (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-nocturn shrink-0" />
              <Input
                value={data.venue}
                onChange={(e) => onChange({ ...data, venue: e.target.value })}
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                placeholder="Enter venue name"
                autoFocus
                className="text-base md:text-sm h-8"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingField("venue")}
              className="flex items-center gap-3 text-sm group"
            >
              <MapPin className="h-4 w-4 text-nocturn shrink-0" />
              {data.venue ? (
                <span className="text-muted-foreground">{data.venue}</span>
              ) : (
                <span className="text-nocturn/70 hover:text-nocturn transition-colors">
                  + Add venue
                </span>
              )}
            </button>
          )}

          {/* Ticket tier */}
          {editingField === "price" ? (
            <div className="flex items-center gap-3">
              <Ticket className="h-4 w-4 text-nocturn shrink-0" />
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                value={data.tierPrice}
                onChange={(e) => onChange({ ...data, tierPrice: Number(e.target.value) })}
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                autoFocus
                className="text-base md:text-sm h-8 w-20"
                min={0}
              />
              <span className="text-sm text-muted-foreground">· {data.tierName}</span>
            </div>
          ) : (
            <button
              onClick={() => setEditingField("price")}
              className="flex items-center gap-3 text-sm group"
            >
              <Ticket className="h-4 w-4 text-nocturn shrink-0" />
              <span className="text-muted-foreground">
                {data.tierPrice === 0 ? "Free RSVP" : `$${data.tierPrice}`} · {data.tierName}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </div>

      {/* Template alternatives */}
      {templates.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">Or pick a template</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => selectTemplate(template)}
                className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:border-nocturn/50 hover:bg-nocturn/5 active:scale-[0.97] ${
                  data.templateId === template.id
                    ? "border-nocturn bg-nocturn/10 text-nocturn"
                    : "border-border text-muted-foreground"
                }`}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Initialize event card data from a vibe + collective name
export function createInitialEventData(vibe: VibeKey, collectiveName: string): EventCardData {
  const templates = getTemplatesForVibe(vibe);
  const template = templates[0];
  if (!template) {
    return {
      title: `${collectiveName} presents`,
      date: getNextSaturday("22:00"),
      venue: "",
      tierName: "General Admission",
      tierPrice: 25,
      templateId: "",
    };
  }
  const nextSat = getNextSaturday(template.defaultDoorTime);
  const tier = template.suggestedTiers[0];
  return {
    title: generateEventTitle(template, collectiveName),
    date: nextSat,
    venue: "",
    tierName: tier?.name ?? "General Admission",
    tierPrice: tier?.price ?? 25,
    templateId: template.id,
  };
}
