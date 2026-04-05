"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import {
  type ParsedEventDetails,
  type TicketTier,
} from "@/app/actions/ai-parse-event";
import { getTicketPricingSuggestion, type PricingSuggestion } from "@/app/actions/pricing-suggestion";
import { calculateBudget, type BudgetResult, type BudgetInput } from "@/app/actions/budget-planner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VenuePicker, { type SelectedVenue } from "@/components/venue-picker";
import { useSpeech } from "@/hooks/use-speech";
import {
  Sparkles,
  ArrowLeft,
  Send,
  Check,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Users,
  Loader2,
  Pencil,
  Mic,
  TrendingUp,
  Target,
} from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


const DRAFT_STORAGE_KEY = "nocturn-event-draft";

interface DraftState {
  messages: Message[];
  eventData: ParsedEventDetails;
  tiers: TicketTier[];
  step: ChatStep;
  phase: "chat" | "review" | "creating" | "done";
}

function saveDraft(state: DraftState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadDraft(): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "ai" | "user";
  content: string;
  /** If set, render venue picker inline below this message */
  widget?: "venue-picker";
}

type ChatStep =
  | "name"
  | "venue"
  | "venue-custom"
  | "datetime"
  | "headliner-type"
  | "headliner-origin"
  | "talent-fee"
  | "venue-costs"
  | "budget-calc"
  | "tickets"
  | "vip"
  | "review";

// ─── Chat Bubbles ────────────────────────────────────────────────────────────

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-white/5 px-4 py-3 max-w-[85%] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="rounded-2xl rounded-tr-sm bg-nocturn px-4 py-3 max-w-[85%] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-white/5 px-5 py-4">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Editable Field Row ──────────────────────────────────────────────────────

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && editValue.trim()) {
            onSave(editValue.trim());
            setEditing(false);
          }
          if (e.key === "Escape") {
            setEditValue(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          if (editValue.trim()) onSave(editValue.trim());
          setEditing(false);
        }}
        className="w-full text-lg font-bold text-white bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-[#7B2FF7]/50"
      />
    );
  }

  return (
    <div className="group/title">
      <button
        onClick={() => {
          setEditValue(value);
          setEditing(true);
        }}
        className="text-lg font-bold text-foreground flex items-center gap-1.5 text-left hover:text-nocturn-light active:scale-[0.98] transition-all duration-200"
      >
        {value}
        <Pencil className="h-3 w-3 text-zinc-500 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
      </button>
    </div>
  );
}

function EditableRow({
  label,
  value,
  icon: Icon,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onSave: (value: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-2 group">
      <Icon className="h-3.5 w-3.5 text-[#7B2FF7] shrink-0" />
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(editValue);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setEditValue(value);
                setEditing(false);
              }
            }}
            onBlur={() => {
              onSave(editValue);
              setEditing(false);
            }}
            className="flex-1 min-w-0 bg-zinc-800 border border-white/10 rounded-md px-2 py-1 text-sm text-white outline-none focus:border-[#7B2FF7]/50"
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setEditValue(value);
            setEditing(true);
          }}
          className="flex items-center gap-1.5 text-sm text-left min-w-0 group/row hover:text-nocturn-light active:scale-[0.98] transition-all duration-200"
        >
          <span className="text-zinc-400 shrink-0">{label}:</span>
          <span className="font-medium text-foreground truncate">{value}</span>
          <Pencil className="h-3 w-3 text-zinc-500 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

// ─── Editable Description ───────────────────────────────────────────────────

function EditableDescription({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [editing, editValue.length]);

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && editValue.trim()) {
            e.preventDefault();
            onSave(editValue.trim());
            setEditing(false);
          }
          if (e.key === "Escape") {
            setEditValue(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          if (editValue.trim()) onSave(editValue.trim());
          setEditing(false);
        }}
        rows={3}
        className="w-full text-sm text-zinc-300 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-[#7B2FF7]/50 resize-none"
      />
    );
  }

  return (
    <div className="group/desc">
      <button
        onClick={() => {
          setEditValue(value);
          setEditing(true);
        }}
        className="text-sm text-zinc-400 line-clamp-3 text-left flex items-start gap-1.5 hover:text-zinc-300 active:scale-[0.98] transition-all duration-200"
      >
        <span className="flex-1">{value}</span>
        <Pencil className="h-3 w-3 text-zinc-500 opacity-0 group-hover/desc:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </button>
    </div>
  );
}

// ─── Editable Tier Row ──────────────────────────────────────────────────────

function EditableTierRow({ tier, onSave }: { tier: TicketTier; onSave: (tier: TicketTier) => void }) {
  const [editingField, setEditingField] = useState<"name" | "price" | "capacity" | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField) inputRef.current?.focus();
  }, [editingField]);

  function startEdit(field: "name" | "price" | "capacity") {
    setEditingField(field);
    if (field === "name") setEditValue(tier.name);
    else if (field === "price") setEditValue(String(tier.price));
    else setEditValue(String(tier.capacity));
  }

  function commitEdit() {
    if (!editingField) return;
    const updated = { ...tier };
    if (editingField === "name" && editValue.trim()) {
      updated.name = editValue.trim();
    } else if (editingField === "price") {
      const num = parseFloat(editValue.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) updated.price = num;
    } else if (editingField === "capacity") {
      const num = parseInt(editValue.replace(/[^0-9]/g, ""));
      if (!isNaN(num) && num > 0) updated.capacity = num;
    }
    onSave(updated);
    setEditingField(null);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  return (
    <div className="flex items-center justify-between bg-zinc-800/50 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-zinc-800/80">
      <div className="flex items-center gap-2">
        {editingField === "name" ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={commitEdit}
            className="w-24 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-sm text-white outline-none focus:border-[#7B2FF7]/50"
          />
        ) : (
          <button
            onClick={() => startEdit("name")}
            className="text-sm font-medium text-white hover:text-nocturn-light active:scale-[0.98] transition-all duration-200 group/name flex items-center gap-1"
          >
            {tier.name}
            <Pencil className="h-2.5 w-2.5 text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-opacity" />
          </button>
        )}
        {editingField === "capacity" ? (
          <input
            ref={editingField === "capacity" ? inputRef : undefined}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={commitEdit}
            className="w-20 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-xs text-white outline-none focus:border-[#7B2FF7]/50"
          />
        ) : (
          <button
            onClick={() => startEdit("capacity")}
            className="text-xs text-zinc-500 hover:text-zinc-300 active:scale-[0.98] transition-all duration-200 group/cap flex items-center gap-1"
          >
            {tier.capacity} tickets
            <Pencil className="h-2.5 w-2.5 text-zinc-500 opacity-0 group-hover/cap:opacity-100 transition-opacity" />
          </button>
        )}
      </div>
      {editingField === "price" ? (
        <input
          ref={editingField === "price" ? inputRef : undefined}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={commitEdit}
          className="w-16 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-sm text-right text-white outline-none focus:border-[#7B2FF7]/50"
        />
      ) : (
        <button
          onClick={() => startEdit("price")}
          className="text-sm font-semibold text-[#7B2FF7] hover:text-nocturn-light active:scale-[0.98] transition-all duration-200 group/price flex items-center gap-1"
        >
          {tier.price === 0 ? "Free" : `$${tier.price}`}
          <Pencil className="h-2.5 w-2.5 text-zinc-500 opacity-0 group-hover/price:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
}

// ─── Confirmation Card ───────────────────────────────────────────────────────

function EventConfirmationCard({
  data,
  tiers,
  onUpdate,
  onEdit,
  onCreate,
  creating,
  error,
}: {
  data: ParsedEventDetails;
  tiers: TicketTier[];
  onUpdate: (field: keyof ParsedEventDetails | "tiers" | "description", value: string | number | TicketTier[]) => void;
  onEdit: () => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}) {
  const dateDisplay = data.date
    ? (() => {
        try {
          const d = new Date(data.date + "T12:00:00");
          return d.toLocaleDateString("en", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
        } catch {
          return data.date;
        }
      })()
    : "";

  const timeDisplay = data.startTime
    ? (() => {
        const [h, m] = (data.startTime ?? "19:00").split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return m === 0
          ? `${hour12} ${period}`
          : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
      })()
    : "";

  return (
    <div className="ml-11 rounded-2xl border border-[#7B2FF7]/20 bg-zinc-900 overflow-hidden animate-scale-in flex flex-col">
      <div className="p-4 space-y-3">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-3 w-3 text-green-400" />
          </div>
          <span className="text-xs text-green-400 font-medium uppercase tracking-wider">
            Ready to create
          </span>
        </div>

        {/* Title — inline editable */}
        <EditableTitle
          value={data.title || "Untitled Event"}
          onSave={(v) => onUpdate("title", v)}
        />

        {data.description && (
          <EditableDescription
            value={data.description}
            onSave={(v) => onUpdate("description", v)}
          />
        )}

        {/* Details grid */}
        <div className="grid gap-2">
          {data.date && (
            <EditableRow
              label="When"
              value={`${dateDisplay}${timeDisplay ? ` at ${timeDisplay}` : ""}`}
              icon={Calendar}
              onSave={(val) => {
                onUpdate("date", val);
              }}
            />
          )}

          {data.doorsOpen && (
            <EditableRow
              label="Doors"
              value={data.doorsOpen}
              icon={Clock}
              onSave={(val) => onUpdate("doorsOpen", val)}
            />
          )}

          {(data.venueName || data.venueCity) && (
            <EditableRow
              label="Where"
              value={[data.venueName, data.venueCity]
                .filter(Boolean)
                .join(", ")}
              icon={MapPin}
              onSave={(val) => {
                const lastCommaIdx = val.lastIndexOf(",");
                if (lastCommaIdx === -1) {
                  // No comma — treat entire string as venue name
                  onUpdate("venueName", val.trim());
                } else {
                  const name = val.slice(0, lastCommaIdx).trim();
                  const city = val.slice(lastCommaIdx + 1).trim();
                  if (name) onUpdate("venueName", name);
                  if (city) onUpdate("venueCity", city);
                }
              }}
            />
          )}
        </div>

        {/* Ticket Tiers */}
        {tiers.length > 0 && (
          <div className="border-t border-white/5 pt-3 mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Ticket className="h-3.5 w-3.5 text-[#7B2FF7]" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tickets</span>
            </div>
            <div className="space-y-2">
              {tiers.map((tier, i) => (
                <EditableTierRow
                  key={i}
                  tier={tier}
                  onSave={(updatedTier) => {
                    const updatedTiers = [...tiers];
                    updatedTiers[i] = updatedTier;
                    onUpdate("tiers", updatedTiers);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {data.venueCapacity !== undefined && data.venueCapacity > 0 && (
          <EditableRow
            label="Capacity"
            value={`${data.venueCapacity}`}
            icon={Users}
            onSave={(val) => {
              const num = parseInt(val.replace(/[^0-9]/g, ""));
              if (!isNaN(num)) onUpdate("venueCapacity", num);
            }}
          />
        )}

        {/* ── Pricing Insight ── */}
        {tiers.length > 0 && tiers.some(t => t.price > 0) && data.venueCity && data.date && (
          <PricingInsight city={data.venueCity} date={data.date} venueCapacity={data.venueCapacity} tiers={tiers} />
        )}

        {/* ── Live Finance Forecast with Pricing Scenarios ── */}
        {tiers.length > 0 && <LiveForecast tiers={tiers} />}
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Action buttons — always visible at bottom */}
      <div className="flex border-t border-white/5 shrink-0 bg-zinc-900">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-zinc-400 font-medium hover:text-white hover:bg-white/5 active:scale-[0.98] transition-all duration-200 border-r border-white/5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Change something
        </button>
        <button
          onClick={onCreate}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-[#7B2FF7] font-semibold hover:text-white hover:bg-[#7B2FF7]/10 active:scale-[0.98] transition-all duration-200"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Create Event
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Pricing Insight ─────────────────────────────────────────────────────────

function PricingInsight({ city, date, venueCapacity, tiers }: {
  city: string;
  date: string;
  venueCapacity?: number;
  tiers: TicketTier[];
}) {
  const [pricing, setPricing] = useState<PricingSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched || !city || !date) return;
    setLoading(true);
    setFetched(true);
    getTicketPricingSuggestion({ city, date, venueCapacity }).then(({ pricing: p }) => {
      setPricing(p);
      setLoading(false);
    }).catch(() => {
      setPricing(null);
      setLoading(false);
    });
  }, [city, date, venueCapacity, fetched]);

  if (loading) {
    return (
      <div className="border-t border-white/5 pt-3 mt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Target className="h-3.5 w-3.5 text-[#7B2FF7] animate-pulse" />
          <span className="text-xs text-zinc-500">Checking market prices...</span>
        </div>
      </div>
    );
  }

  if (!pricing) return null;

  // Compare user's GA price to market
  const userGA = tiers.find(t => t.price > 0 && !t.name.toLowerCase().includes("vip"))?.price ?? 0;
  const diff = userGA - pricing.avgGA;
  const diffLabel = diff > 5 ? "above" : diff < -5 ? "below" : "in line with";
  const diffColor = diff > 5 ? "text-yellow-400" : diff < -5 ? "text-green-400" : "text-green-400";

  return (
    <div className="border-t border-white/5 pt-3 mt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Target className="h-3.5 w-3.5 text-[#7B2FF7]" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Market Pricing</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
          pricing.confidence === "high" ? "bg-green-500/10 text-green-400" :
          pricing.confidence === "medium" ? "bg-yellow-500/10 text-yellow-400" :
          "bg-zinc-500/10 text-zinc-400"
        }`}>
          {pricing.confidence} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${pricing.avgGA}</p>
          <p className="text-[9px] text-zinc-500">avg GA in {city}</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${pricing.avgVIP}</p>
          <p className="text-[9px] text-zinc-500">avg VIP in {city}</p>
        </div>
      </div>

      {userGA > 0 && (
        <p className="text-[11px] text-zinc-400 mb-1.5">
          Your GA (<span className="text-white font-medium">${userGA}</span>) is{" "}
          <span className={`font-medium ${diffColor}`}>{diffLabel}</span>{" "}
          the market average.
        </p>
      )}

      {pricing.competingEvents > 0 && (
        <p className="text-[10px] text-zinc-500">
          {pricing.competingEvents} other event{pricing.competingEvents > 1 ? "s" : ""} this weekend in {city}
        </p>
      )}

      <p className="text-[10px] text-zinc-600 mt-1 italic">{pricing.suggestion}</p>
    </div>
  );
}

// ─── Live Forecast with Pricing Scenarios ────────────────────────────────────

function LiveForecast({ tiers }: { tiers: TicketTier[] }) {
  const [priceMultiplier, setPriceMultiplier] = useState(1.0);

  const STRIPE_FEE_RATE = 0.029;
  const STRIPE_FEE_FLAT = 0.30;

  const adjustedTiers = tiers.map((t) => ({
    ...t,
    price: Math.round(t.price * priceMultiplier),
  }));

  const totalCapacity = adjustedTiers.reduce((s, t) => s + t.capacity, 0);
  const maxRevenue = adjustedTiers.reduce((s, t) => s + t.price * t.capacity, 0);
  const avgPrice = totalCapacity > 0 ? maxRevenue / totalCapacity : 0;

  function calcNet(rate: number) {
    const ticketsSold = Math.round(totalCapacity * rate);
    const gross = adjustedTiers.reduce((s, t) => s + t.price * Math.round(t.capacity * rate), 0);
    // Buyer pays all fees — organizer keeps 100% of ticket price
    // Stripe processing still applies to payout (~2.9% + $0.30)
    const stripeProcessing = ticketsSold * STRIPE_FEE_FLAT + gross * STRIPE_FEE_RATE;
    return { ticketsSold, gross, net: gross - stripeProcessing };
  }

  const scenarios = [
    { label: "50% sold", emoji: "😐", rate: 0.5 },
    { label: "75% sold", emoji: "🔥", rate: 0.75 },
    { label: "Sell-out", emoji: "🚀", rate: 1.0 },
  ];

  const projections = scenarios.map((s) => ({ ...s, ...calcNet(s.rate) }));
  const priceLabels = ["Lower", "Current", "Higher"];
  const priceIndex = priceMultiplier < 1 ? 0 : priceMultiplier > 1 ? 2 : 1;

  return (
    <div className="border-t border-white/5 pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-[#7B2FF7]" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Revenue Forecast
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-2 py-0.5">
          {priceLabels[priceIndex]} pricing
        </span>
      </div>

      {/* Headline */}
      <div className="text-center py-2">
        <p className="text-3xl font-bold text-white">
          ${projections[2].net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <p className="text-xs text-zinc-500 mt-1">max net revenue at sell-out</p>
      </div>

      {/* Price slider — "What if?" */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">What if you charge...</span>
          <span className="text-xs font-bold text-[#7B2FF7]">
            ${avgPrice.toFixed(0)} avg
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={priceMultiplier}
          onChange={(e) => setPriceMultiplier(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-zinc-800 accent-[#7B2FF7] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>${Math.round(tiers[0]?.price * 0.5 || 0)}</span>
          <span>${tiers[0]?.price || 0} (current)</span>
          <span>${Math.round(tiers[0]?.price * 2 || 0)}</span>
        </div>
      </div>

      {/* Adjusted tier prices */}
      {priceMultiplier !== 1.0 && (
        <div className="flex flex-wrap gap-1.5">
          {adjustedTiers.map((t, i) => (
            <span key={i} className="text-[11px] bg-zinc-800/80 text-zinc-400 rounded-full px-2 py-0.5">
              {t.name}: <span className="text-white font-medium">${t.price}</span>
              <span className="text-zinc-600 line-through ml-1">${tiers[i].price}</span>
            </span>
          ))}
        </div>
      )}

      {/* Scenario comparison */}
      <div className="space-y-1.5">
        {projections.map((p) => (
          <div
            key={p.label}
            className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-3 py-2 transition-colors duration-200 hover:bg-zinc-800/50"
          >
            <span className="text-sm">{p.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500">{p.label}</span>
                <span className="text-xs font-bold text-white">
                  ${p.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${p.rate * 100}%`,
                    backgroundColor: p.rate >= 1 ? "#7B2FF7" : p.rate >= 0.75 ? "#22c55e" : "#eab308",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${avgPrice.toFixed(0)}</p>
          <p className="text-[9px] text-zinc-500">avg ticket</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">{totalCapacity}</p>
          <p className="text-[9px] text-zinc-500">capacity</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-green-400">
            ${projections[1].net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[9px] text-zinc-500">@ 75%</p>
        </div>
      </div>

      <p className="text-[9px] text-zinc-600 text-center">
        Net after Stripe fees (2.9% + $0.30) • You keep 100% of ticket price
      </p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [eventData, setEventData] = useState<ParsedEventDetails>({});
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [thinking, setThinking] = useState(false);
  const [step, setStep] = useState<ChatStep>("name");
  const [phase, setPhase] = useState<"chat" | "review" | "creating" | "done">(
    "chat"
  );
  const [error, setError] = useState<string | null>(null);
  const [introShown, setIntroShown] = useState(false);
  const [budgetInput, setBudgetInput] = useState<Partial<BudgetInput>>({});
  const [, setBudgetResult] = useState<BudgetResult | null>(null);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { listening, transcript, startListening, stopListening, clearTranscript } = useSpeech();
  const [speechSupported, setSpeechSupported] = useState(false);

  // ── Restore draft from localStorage on mount ──────────────────────────
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.messages.length > 1) {
      setMessages(draft.messages);
      setEventData(draft.eventData);
      setTiers(draft.tiers);
      setStep(draft.step);
      setPhase(draft.phase === "creating" ? "review" : draft.phase);
      setIntroShown(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced save to localStorage on key state changes ───────────────
  const saveDraftDebounced = useCallback(() => {
    const timer = setTimeout(() => {
      if (phase === "done") return; // don't persist after creation
      saveDraft({ messages, eventData, tiers, step, phase });
    }, 500);
    return timer;
  }, [messages, eventData, tiers, step, phase]);

  useEffect(() => {
    const timer = saveDraftDebounced();
    return () => clearTimeout(timer);
  }, [saveDraftDebounced]);

  // Detect speech recognition support
  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      setSpeechSupported(true);
    }
  }, []);

  // Auto-submit speech transcript
  useEffect(() => {
    if (transcript && !thinking) {
      setInput(transcript);
      clearTranscript();
      // Submit on next tick so the input state is set
      setTimeout(() => {
        const form = document.getElementById("chat-form") as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        } else {
          setInput(transcript);
        }
      }, 50);
    }
  }, [transcript, thinking, clearTranscript]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, phase, showVenuePicker]);

  // Show intro message
  useEffect(() => {
    if (!introShown) {
      setIntroShown(true);
      setMessages([
        {
          role: "ai",
          content: "Tell me about your event — name, date, venue, whatever you know. I'll figure out the rest. 🌙",
        },
      ]);
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [introShown]);

  // Warn before leaving with unsaved data
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if ((phase === "chat" || phase === "review") && messages.length > 1) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase, messages.length]);

  // ── Start over handler ─────────────────────────────────────────────────
  function handleStartOver() {
    if (!window.confirm("Start over? You'll lose your progress.")) return;
    clearDraft();
    setMessages([
      {
        role: "ai",
        content: "Tell me about your event — name, date, venue, whatever you know. I'll figure out the rest. \u{1F319}",
      },
    ]);
    setEventData({});
    setTiers([]);
    setStep("name");
    setPhase("chat");
    setBudgetInput({});
    setBudgetResult(null);
    setError(null);
    setShowVenuePicker(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Step advancement helper ──────────────────────────────────────────────

  function advanceToStep(nextStep: ChatStep) {
    setStep(nextStep);

    if (nextStep === "review") {
      setPhase("review");
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Here\u2019s what I\u2019ve set up:" },
      ]);
    } else if (nextStep === "venue") {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Where\u2019s it happening?",
          widget: "venue-picker",
        },
      ]);
      setShowVenuePicker(true);
    } else {
      const prompts: Record<string, string> = {
        "venue-custom":
          'Type the venue name, address, and city.\n\nE.g. "CODA, 794 Bathurst St, Toronto"',
        datetime:
          'When? Date and time?\n\nTry something like "April 25 10pm" or "2026-04-25 at 22:00"',
        "headliner-type":
          "What kind of event is this?\n\n🌍 **International headliner** — flying someone in\n🏠 **Local headliner** — hometown talent\n🎵 **No headliner** — collective showcase or open format\n\nJust say international, local, or no headliner.",
        "headliner-origin":
          "Where is your headliner coming from?\n\nE.g. \"London, UK\" or \"New York\" — I'll estimate flights, hotel, and transport.",
        "talent-fee":
          "What's the talent fee? And how many nights are they staying?\n\nE.g. \"$2000, staying 2 nights\" or just the fee if it's a day trip.",
        "venue-costs":
          "Any venue costs?\n\n💰 **Room rental** — flat fee to book the space\n🍸 **Bar minimum** — spend threshold or lose deposit\n💵 **Deposit** — upfront payment\n🔧 **Other** — sound, lights, security, promo\n\nE.g. \"$500 rental, $3000 bar min, $1000 deposit, $800 other\" or \"no venue costs\"",
        tickets:
          'Ticket price and capacity?\n\nE.g. "$25, 200 tickets" or "free"',
        vip: 'Want to add a VIP tier?\n\nE.g. "$50 VIP, 50 tickets" or type "skip"',
      };
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: prompts[nextStep] || "" },
      ]);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Handle text input send — AI parses everything ───────────────────────

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    setThinking(true);

    // ── Budget planning step handlers ──────────────────────────────────
    if (step === "headliner-type") {
      const lower = userMsg.toLowerCase();
      let headlinerType: "local" | "international" | "none" = "none";
      if (lower.includes("international") || lower.includes("flying") || lower.includes("abroad")) {
        headlinerType = "international";
      } else if (lower.includes("local") || lower.includes("hometown") || lower.includes("home")) {
        headlinerType = "local";
      } else if (lower.includes("no") || lower.includes("none") || lower.includes("skip") || lower.includes("showcase") || lower.includes("open")) {
        headlinerType = "none";
      }

      setBudgetInput(prev => ({ ...prev, headlinerType, venueCity: eventData.venueCity, venueCapacity: eventData.venueCapacity, date: eventData.date }));
      setEventData(prev => ({ ...prev, headlinerType }));
      setThinking(false);

      if (headlinerType === "international") {
        advanceToStep("headliner-origin");
      } else if (headlinerType === "local") {
        advanceToStep("talent-fee");
      } else {
        advanceToStep("venue-costs");
      }
      return;
    }

    if (step === "headliner-origin") {
      setBudgetInput(prev => ({ ...prev, headlinerOrigin: userMsg }));
      setThinking(false);
      advanceToStep("talent-fee");
      return;
    }

    if (step === "talent-fee") {
      const feeMatch = userMsg.match(/\$?([\d,]+)/);
      const fee = feeMatch ? parseInt(feeMatch[1].replace(/,/g, "")) : 0;
      const nightsMatch = userMsg.match(/(\d+)\s*night/i);
      const nights = nightsMatch ? parseInt(nightsMatch[1]) : undefined;

      setBudgetInput(prev => ({ ...prev, talentFee: fee, stayNights: nights }));
      setThinking(false);
      advanceToStep("venue-costs");
      return;
    }

    if (step === "venue-costs") {
      const lower = userMsg.toLowerCase();
      if (lower.includes("no") || lower.includes("none") || lower.includes("skip") || lower === "0") {
        // No venue costs — go calculate budget
        setThinking(true);
        try {
          const finalBudget = { ...budgetInput, venueCost: 0, barMinimum: 0, deposit: 0, otherExpenses: 0 } as BudgetInput;
          const result = await calculateBudget(finalBudget);
          setBudgetResult(result);

          // Auto-populate suggested tiers
          if (result.suggestedTiers.length > 0) {
            setTiers(result.suggestedTiers.map(t => ({ name: t.name, price: t.price, capacity: t.capacity })));
          }

          setThinking(false);
          // Show budget summary and go to review
          const tierSummary = result.suggestedTiers.map(t => `• ${t.name}: $${t.price} × ${t.capacity}`).join("\n");
          setMessages(prev => [
            ...prev,
            { role: "ai", content: `📊 **Budget Breakdown**\n\nTotal expenses: **$${result.totalExpenses.toLocaleString()}**${result.travelEstimate ? `\nTravel: ~$${result.travelEstimate.total.toLocaleString()} (${result.travelEstimate.breakdown})` : ""}\n\nBreak-even: ${result.breakEven.ticketsNeeded} tickets at $${result.breakEven.atPrice}\n\n🎫 **Suggested ticket tiers:**\n${tierSummary}\n\n${result.scenarios.map(s => `${s.label}: $${s.revenue.toLocaleString()} revenue → ${s.profit >= 0 ? "✅" : "❌"} $${s.profit.toLocaleString()} ${s.profit >= 0 ? "profit" : "loss"}`).join("\n")}\n\nThese tiers are pre-loaded. You can adjust prices in the review, or tell me different amounts.` },
          ]);
          setStep("review");
          setPhase("review");
        } catch {
          setThinking(false);
          setMessages(prev => [
            ...prev,
            { role: "ai", content: "I couldn't calculate the budget. Let's continue — you can adjust later." },
          ]);
          setStep("review");
          setPhase("review");
        }
        return;
      }

      // Parse venue costs
      const rentalMatch = userMsg.match(/\$?([\d,]+)\s*(?:rental|rent|room)/i);
      const barMinMatch = userMsg.match(/\$?([\d,]+)\s*(?:bar\s*min|minimum)/i);
      const depositMatch = userMsg.match(/\$?([\d,]+)\s*(?:deposit|down)/i);
      const otherMatch = userMsg.match(/\$?([\d,]+)\s*(?:other|sound|light|security|promo|misc)/i);

      // If no specific labels, try to parse just numbers
      const allNumbers = [...userMsg.matchAll(/\$?([\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, "")));

      const venueCost = rentalMatch ? parseInt(rentalMatch[1].replace(/,/g, "")) : (allNumbers[0] ?? 0);
      const barMinimum = barMinMatch ? parseInt(barMinMatch[1].replace(/,/g, "")) : 0;
      const deposit = depositMatch ? parseInt(depositMatch[1].replace(/,/g, "")) : 0;
      const otherExpenses = otherMatch ? parseInt(otherMatch[1].replace(/,/g, "")) : (allNumbers.length > 1 ? allNumbers[allNumbers.length - 1] : 0);

      setBudgetInput(prev => ({ ...prev, venueCost, barMinimum, deposit, otherExpenses }));

      // Calculate budget
      setThinking(true);
      try {
        const finalBudget = { ...budgetInput, venueCost, barMinimum, deposit, otherExpenses } as BudgetInput;
        const result = await calculateBudget(finalBudget);
        setBudgetResult(result);

        // Auto-populate suggested tiers
        if (result.suggestedTiers.length > 0) {
          setTiers(result.suggestedTiers.map(t => ({ name: t.name, price: t.price, capacity: t.capacity })));
        }

        setThinking(false);

        const tierSummary = result.suggestedTiers.map(t => `• ${t.name}: $${t.price} × ${t.capacity}`).join("\n");
        setMessages(prev => [
          ...prev,
          { role: "ai", content: `📊 **Budget Breakdown**\n\nTotal expenses: **$${result.totalExpenses.toLocaleString()}**${result.travelEstimate ? `\nTravel estimate: ~$${result.travelEstimate.total.toLocaleString()}\n${result.travelEstimate.breakdown}` : ""}${barMinimum > 0 ? `\n\n⚠️ Bar minimum: $${barMinimum.toLocaleString()} — if you don't hit it, you lose your $${deposit.toLocaleString()} deposit.` : ""}\n\nBreak-even: ${result.breakEven.ticketsNeeded} tickets at $${result.breakEven.atPrice}\n\n🎫 **Suggested ticket tiers:**\n${tierSummary}\n\n${result.scenarios.map(s => `${s.label}: $${s.revenue.toLocaleString()} revenue → ${s.profit >= 0 ? "✅" : "❌"} $${s.profit.toLocaleString()} ${s.profit >= 0 ? "profit" : "loss"}`).join("\n")}\n\nThese tiers are pre-loaded. Adjust in the review or tell me different prices.` },
        ]);
        setStep("review");
        setPhase("review");
      } catch {
        setThinking(false);
        setMessages(prev => [
          ...prev,
          { role: "ai", content: "I couldn't calculate the budget. Let's continue — you can adjust later." },
        ]);
        setStep("review");
        setPhase("review");
      }
      return;
    }

    try {
      // Let Claude parse whatever the user said — no rigid steps
      const { parseEventDetails } = await import("@/app/actions/ai-parse-event");
      const { parsed, reply } = await parseEventDetails(userMsg, eventData);

      // Check for auth expiry
      if (reply && reply.includes("Not authenticated")) {
        setThinking(false);
        router.push("/login");
        return;
      }

      // Merge new data with existing
      const merged = { ...eventData, ...parsed };
      setEventData(merged);

      // Handle ticket tiers from parsed data
      if (parsed.tiers && parsed.tiers.length > 0) {
        setTiers(parsed.tiers);
      } else if (parsed.ticketPrice !== undefined && tiers.length === 0) {
        const cap = parsed.ticketQuantity || merged.venueCapacity || 100;
        setTiers([{
          name: parsed.ticketTierName || "General Admission",
          price: parsed.ticketPrice,
          capacity: cap,
        }]);
      }

      // Handle tickets step — free event ask about bar revenue, or advance
      if (step === "tickets") {
        if (parsed.ticketPrice === 0 && !merged.barMinimum) {
          setThinking(false);
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: "Got it, free event! 🆓\n\nAre you earning revenue another way? For example:\n• **Bar revenue** — percentage of bar sales\n• **Sponsorship** or **door donations**\n\nOr just say \"no\" and we'll skip the budget planner." },
          ]);
          return;
        }

        // User answered the bar revenue question or provided pricing — advance
        const lower = userMsg.toLowerCase();
        const isNo = /^(no|nah|nope|skip|none|not really)/.test(lower);
        if (isNo || parsed.ticketPrice !== undefined || parsed.barMinimum !== undefined || parsed.venueCapacity !== undefined) {
          setThinking(false);
          if (isNo && merged.ticketPrice === 0) {
            // Free event, no other revenue — skip budget planner, go to review
            setMessages((prev) => [
              ...prev,
              { role: "ai", content: "All good! Let's get this event created. Here's what I've set up:" },
            ]);
            setStep("review");
            setPhase("review");
            return;
          }
          // Has pricing info — advance to budget planning
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: reply || "Got it!" },
          ]);
          advanceToStep("headliner-type");
          return;
        }
      }

      // ── Budget field update from chat (e.g. "increase talent fee to $800") ──
      const budgetFieldUpdated =
        parsed.talentFee !== undefined ||
        parsed.venueCost !== undefined ||
        parsed.barMinimum !== undefined ||
        parsed.deposit !== undefined ||
        parsed.otherExpenses !== undefined;

      if (budgetFieldUpdated && step === "review") {
        // Update budget inputs with the new values
        const updatedBudget = {
          ...budgetInput,
          ...(parsed.talentFee !== undefined && { talentFee: parsed.talentFee }),
          ...(parsed.venueCost !== undefined && { venueCost: parsed.venueCost }),
          ...(parsed.barMinimum !== undefined && { barMinimum: parsed.barMinimum }),
          ...(parsed.deposit !== undefined && { deposit: parsed.deposit }),
          ...(parsed.otherExpenses !== undefined && { otherExpenses: parsed.otherExpenses }),
        };
        setBudgetInput(updatedBudget);

        // Recalculate budget with updated inputs
        try {
          const result = await calculateBudget(updatedBudget as BudgetInput);
          setBudgetResult(result);

          // Update tiers from recalculated budget (unless user explicitly set tiers)
          if (!parsed.tiers && result.suggestedTiers.length > 0) {
            setTiers(result.suggestedTiers.map(t => ({ name: t.name, price: t.price, capacity: t.capacity })));
          }

          const changes: string[] = [];
          if (parsed.talentFee !== undefined) changes.push(`talent fee → $${parsed.talentFee.toLocaleString()}`);
          if (parsed.venueCost !== undefined) changes.push(`venue cost → $${parsed.venueCost.toLocaleString()}`);
          if (parsed.barMinimum !== undefined) changes.push(`bar minimum → $${parsed.barMinimum.toLocaleString()}`);
          if (parsed.deposit !== undefined) changes.push(`deposit → $${parsed.deposit.toLocaleString()}`);
          if (parsed.otherExpenses !== undefined) changes.push(`other expenses → $${parsed.otherExpenses.toLocaleString()}`);

          const tierSummary = result.suggestedTiers.map(t => `• ${t.name}: $${t.price} × ${t.capacity}`).join("\n");

          setThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              content: `Updated ${changes.join(", ")}.\n\n📊 **Revised Budget**\nTotal expenses: **$${result.totalExpenses.toLocaleString()}**\nBreak-even: ${result.breakEven.ticketsNeeded} tickets at $${result.breakEven.atPrice}\n\n🎫 **Updated tiers:**\n${tierSummary}\n\n${result.scenarios.map(s => `${s.label}: $${s.revenue.toLocaleString()} → ${s.profit >= 0 ? "✅" : "❌"} $${s.profit.toLocaleString()}`).join("\n")}`,
            },
          ]);
          setPhase("review");
        } catch {
          setThinking(false);
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: reply || "Updated! Here's the revised plan:" },
          ]);
          setPhase("review");
        }
        return;
      }

      // If coming back from review with tier updates only, go straight back to review
      if (step === "review" && (parsed.tiers || parsed.ticketPrice !== undefined)) {
        // Update existing tiers if user changed the price (e.g. "make it free")
        if (parsed.ticketPrice !== undefined && !parsed.tiers && tiers.length > 0) {
          setTiers(tiers.map(t => ({ ...t, price: parsed.ticketPrice! })));
        }
        setThinking(false);
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: reply || "Updated the tiers. Here's the revised plan:" },
        ]);
        setPhase("review");
        return;
      }

      setThinking(false);

      // Check what's still missing
      const missing: string[] = [];
      if (!merged.title) missing.push("event name");
      if (!merged.date) missing.push("date");
      if (!merged.startTime) missing.push("time");
      if (!merged.venueName) missing.push("venue");

      const currentStep = step as string;
      if (missing.length === 0 && !["headliner-type", "headliner-origin", "talent-fee", "venue-costs", "budget-calc", "tickets"].includes(currentStep)) {
        // All basic info collected — ask about capacity and pricing before budget
        if (!merged.venueCapacity && !merged.ticketPrice && merged.ticketPrice !== 0 && step !== "tickets") {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: `${reply || "Got it!"}\n\nDoes this look right so far?\n\n🎤 **${merged.title}**\n📅 ${merged.date}${merged.startTime ? ` at ${merged.startTime}` : ""}\n📍 ${merged.venueName}${merged.venueCity ? `, ${merged.venueCity}` : ""}\n\nWhat's the **capacity** and **ticket price**? E.g. "200 cap, $25" or "free"` },
          ]);
          setStep("tickets");
          return;
        }

        // If we have capacity but no price, ask about price specifically
        if (merged.venueCapacity && merged.ticketPrice === undefined && step !== "tickets") {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: `${reply || "Got it!"}\n\nWhat's the **ticket price**? E.g. "$25" or "free"\n\nIf it's free, are you earning revenue another way? (e.g. bar revenue percentage)` },
          ]);
          setStep("tickets");
          return;
        }

        // Now ask about budget planning
        if (!eventData.headlinerType && !budgetInput.headlinerType) {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: reply || "Got it!" },
          ]);
          advanceToStep("headliner-type");
          return;
        }

        // If coming back from review with any field update, go back to review
        if (step === "review") {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: reply || "Updated! Here's the revised plan:" },
          ]);
          setPhase("review");
          return;
        }

        // Everything we need — go to review
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: reply || "Got it all — here's what I've set up:" },
        ]);
        setStep("review");
        setPhase("review");
      } else if (missing.length <= 2) {
        // Almost there — ask for what's missing naturally
        const needStr = missing.join(" and ");
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: `${reply || "Got it!"}\n\nJust need the ${needStr} and we're good to go.`,
          },
        ]);
      } else {
        // Got some info, need more
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: reply || `Nice! I still need: ${missing.join(", ")}. Tell me more.`,
          },
        ]);
      }
    } catch (err) {
      console.error("Parse error:", err);
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "I didn't catch that — try telling me the event name, date, time, and venue.",
        },
      ]);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Venue picker handlers ────────────────────────────────────────────────

  function handleVenueSelect(venue: SelectedVenue) {
    setShowVenuePicker(false);

    setEventData((prev) => ({
      ...prev,
      venueName: venue.name,
      venueAddress: venue.address,
      venueCity: venue.city,
      venueCapacity: venue.capacity,
    }));

    // Add user message showing the selection
    const addressShort = venue.address.split(",")[0] ?? venue.address;
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `\u{1F4CD} ${venue.name} \u2014 ${addressShort}, ${venue.city}`,
      },
    ]);

    // Brief thinking delay then advance
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      advanceToStep("datetime");
    }, 500);
  }

  function handleVenueCustom() {
    setShowVenuePicker(false);
    setStep("venue-custom");
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        content:
          'Type the venue name, address, and city.\n\nE.g. "CODA, 794 Bathurst St, Toronto"',
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Review / create handlers ─────────────────────────────────────────────

  function handleUpdateField(
    field: keyof ParsedEventDetails | "tiers" | "description",
    value: string | number | TicketTier[]
  ) {
    if (field === "tiers" && Array.isArray(value)) {
      setTiers(value as TicketTier[]);
    } else {
      setEventData((prev) => ({ ...prev, [field]: value }));
    }
  }

  function handleBackToChat() {
    setPhase("chat");
    // Keep existing data — just let them make changes via chat
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        content: "What would you like to change? You can say things like:\n• \"Increase talent fee to $800\"\n• \"Change Early Bird to $20\"\n• \"Add a VIP tier at $50 for 30 people\"\n• \"Move the date to May 10\"",
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleCreate() {
    setError(null);

    const d = eventData;

    // Validate date is set — don't silently fall back to today
    if (!d.date) {
      setError("Please specify a date for your event.");
      return;
    }

    setPhase("creating");

    // Build tiers from the collected ticket tiers, or fallback to single-tier legacy
    let validTiers: { name: string; price: number; quantity: number }[] = [];
    if (tiers.length > 0) {
      validTiers = tiers.map((t) => ({
        name: t.name,
        price: t.price,
        quantity: t.capacity,
      }));
    } else if (d.ticketPrice !== undefined) {
      validTiers = [
        {
          name: d.ticketTierName || "General Admission",
          price: d.ticketPrice,
          quantity: d.ticketQuantity || d.venueCapacity || 100,
        },
      ];
    }

    try {
      const result = await createEvent({
        title: d.title || "Untitled Event",
        slug: slugify(d.title || "untitled-event"),
        description: d.description || null,
        date: d.date,
        doorsOpen: d.doorsOpen || null,
        startTime: d.startTime || "22:00",
        endTime: d.endTime || null,
        venueName: d.venueName || "TBA",
        venueAddress: d.venueAddress || "",
        venueCity: d.venueCity || "",
        venueCapacity: d.venueCapacity || 0,
        tiers: validTiers,
      });

      if (result.error) {
        setError(result.error);
        setPhase("review");
        return;
      }

      haptic('success');
      clearDraft();
      if (typeof window !== "undefined") {
        sessionStorage.setItem("event-created", "true");
      }
      setPhase("done");
      setTimeout(() => {
        router.push(`/dashboard/events/${result.eventId}`);
        router.refresh();
      }, 2000);
    } catch {
      setError("Network error — please try again.");
      setPhase("review");
    }
  }

  // ── Should show text input? ──────────────────────────────────────────────
  const showInput = phase === "chat" && step !== "venue";

  // ── Placeholder — contextual based on what's missing ───────────────────
  function getPlaceholder(): string {
    const d = eventData;
    if (!d.title) return '"Midnight Sessions at Coda, April 25 10pm, $25"';
    if (!d.venueName) return 'Where? e.g. "Coda, Toronto"';
    if (!d.date) return 'When? e.g. "next Saturday 10pm"';
    if (!d.startTime) return 'What time? e.g. "10pm"';
    return 'Add more details or say "looks good"...';
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 shrink-0">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        {messages.length > 1 && (
          <button
            onClick={handleStartOver}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Start over
          </button>
        )}
        <h1 className="text-xl font-bold font-heading truncate">
          New Event
        </h1>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-[#7B2FF7]/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-[#7B2FF7]" />
          <span className="text-xs font-medium text-[#7B2FF7]">AI</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0" aria-live="polite">
        {messages.map((msg, i) => {
          if (msg.role === "ai") {
            return (
              <div key={i} className="space-y-3">
                <AiBubble>
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {msg.content}
                  </p>
                </AiBubble>
                {/* Show venue picker inline right after the venue AI message */}
                {msg.widget === "venue-picker" && showVenuePicker && (
                  <VenuePicker
                    onSelect={handleVenueSelect}
                    onCustom={handleVenueCustom}
                  />
                )}
              </div>
            );
          }
          return (
            <UserBubble key={i}>
              <p className="text-sm text-white">{msg.content}</p>
            </UserBubble>
          );
        })}

        {thinking && <ThinkingDots />}

        {/* Review card with editable fields */}
        {(phase === "review" || phase === "creating") && (
          <EventConfirmationCard
            data={eventData}
            tiers={tiers}
            onUpdate={handleUpdateField}
            onEdit={handleBackToChat}
            onCreate={handleCreate}
            creating={phase === "creating"}
            error={error}
          />
        )}

        {/* Done state */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold font-heading truncate max-w-full px-4">
                {eventData.title} — draft created!
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Taking you to the event dashboard to finish setup...
              </p>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input bar — shown during chat steps that need text input */}
      {showInput && (
        <form
          id="chat-form"
          onSubmit={handleSend}
          className="shrink-0 flex gap-2 border-t border-white/5 pt-3 pb-2"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
          }}
        >
          <Input
            ref={inputRef}
            placeholder={getPlaceholder()}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            aria-label="Describe your event"
            className="flex-1 text-sm bg-zinc-900 border-white/10 rounded-full px-4 focus:border-[#7B2FF7]/50 min-h-[44px]"
            disabled={thinking || listening}
          />
          {speechSupported && (
            <Button
              type="button"
              size="icon"
              onClick={listening ? stopListening : startListening}
              className={`shrink-0 rounded-full min-h-[44px] min-w-[44px] transition-all duration-200 active:scale-95 ${
                listening
                  ? "bg-red-600 hover:bg-red-700 animate-pulse"
                  : "bg-zinc-800 hover:bg-zinc-700 border border-white/10"
              }`}
              disabled={thinking}
            >
              <Mic className={`h-4 w-4 ${listening ? "text-white" : "text-zinc-400"}`} />
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            className="bg-[#7B2FF7] hover:bg-[#6B1FE7] shrink-0 rounded-full min-h-[44px] min-w-[44px] transition-all duration-200 active:scale-95"
            disabled={!input.trim() || thinking}
          >
            {thinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
