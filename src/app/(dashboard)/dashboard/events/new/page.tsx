"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import {
  type ParsedEventDetails,
  type TicketTier,
} from "@/app/actions/ai-parse-event";
import { getTicketPricingSuggestion, type PricingSuggestion } from "@/app/actions/pricing-suggestion";
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
  DollarSign,
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

/**
 * Parse a ticket tier from natural language (client-side).
 * Handles: "$25 for 200", "$50 VIP, 50 tickets", "free", "$25 for 200 tickets"
 */
function parseTicketTier(message: string): TicketTier | null {
  const lower = message.toLowerCase().trim();

  // "free" or "free event"
  if (/^free\b/.test(lower)) {
    return { name: "General Admission", price: 0, capacity: 100 };
  }

  // "$25 for 200" or "$25 for 200 tickets"
  const priceForQty = lower.match(/\$(\d+(?:\.\d{2})?)\s+(?:for\s+)?(\d+)(?:\s*tickets?)?/);
  if (priceForQty) {
    const price = parseFloat(priceForQty[1]);
    const capacity = parseInt(priceForQty[2]);
    const tierName = extractTierName(lower) || "General Admission";
    return { name: tierName, price, capacity };
  }

  // "$50 VIP, 50 tickets" or "$50 VIP 50 tickets"
  const priceNameQty = lower.match(/\$(\d+(?:\.\d{2})?)\s+(\w+)[\s,]+(\d+)\s*tickets?/);
  if (priceNameQty) {
    const price = parseFloat(priceNameQty[1]);
    const name = priceNameQty[2].charAt(0).toUpperCase() + priceNameQty[2].slice(1);
    const capacity = parseInt(priceNameQty[3]);
    return { name, price, capacity };
  }

  // "$25 GA" or "$50 VIP" (no quantity specified — default 100)
  const priceAndName = lower.match(/\$(\d+(?:\.\d{2})?)\s+(\w+)/);
  if (priceAndName) {
    const price = parseFloat(priceAndName[1]);
    const name = priceAndName[2].charAt(0).toUpperCase() + priceAndName[2].slice(1);
    return { name, price, capacity: 100 };
  }

  // Just "$25" (no name, no qty)
  const justPrice = lower.match(/\$(\d+(?:\.\d{2})?)/);
  if (justPrice) {
    const price = parseFloat(justPrice[1]);
    const tierName = extractTierName(lower) || "General Admission";
    return { name: tierName, price, capacity: 100 };
  }

  return null;
}

function extractTierName(lower: string): string | null {
  const tierKeywords = ["vip", "ga", "general admission", "early bird", "table", "bottle service"];
  for (const kw of tierKeywords) {
    if (lower.includes(kw)) {
      if (kw === "ga") return "General Admission";
      return kw.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  return null;
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
  | "tickets"
  | "vip"
  | "review";

// ─── Chat Bubbles ────────────────────────────────────────────────────────────

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7B2FF7]/20">
        <Sparkles className="h-4 w-4 text-[#7B2FF7]" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-zinc-900 border border-white/5 px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="rounded-2xl rounded-tr-sm bg-[#7B2FF7] px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7B2FF7]/20 animate-pulse">
        <Sparkles className="h-4 w-4 text-[#7B2FF7]" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-zinc-900 border border-white/5 px-5 py-4">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
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
        className="text-lg font-bold text-white flex items-center gap-1.5 text-left"
      >
        {value}
        <Pencil className="h-3 w-3 text-zinc-600 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
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
          className="flex items-center gap-1.5 text-sm text-left min-w-0 group/row"
        >
          <span className="text-zinc-400 shrink-0">{label}:</span>
          <span className="font-medium text-white truncate">{value}</span>
          <Pencil className="h-3 w-3 text-zinc-600 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
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
  onUpdate: (field: keyof ParsedEventDetails, value: string | number) => void;
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
        const [h, m] = data.startTime!.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return m === 0
          ? `${hour12} ${period}`
          : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
      })()
    : "";

  return (
    <div className="ml-11 rounded-xl border border-[#7B2FF7]/20 bg-zinc-900 overflow-hidden animate-scale-in">
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
          <p className="text-sm text-zinc-400">{data.description}</p>
        )}

        {/* Details grid */}
        <div className="grid gap-2">
          {data.date && (
            <EditableRow
              label="When"
              value={`${dateDisplay}${timeDisplay ? ` at ${timeDisplay}` : ""}`}
              icon={Calendar}
              onSave={() => {
                onUpdate("date", data.date!);
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
                const parts = val.split(",").map((s) => s.trim());
                if (parts[0]) onUpdate("venueName", parts[0]);
                if (parts[1]) onUpdate("venueCity", parts[1]);
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
                <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{tier.name}</span>
                    <span className="text-xs text-zinc-500">{tier.capacity} tickets</span>
                  </div>
                  <span className="text-sm font-semibold text-[#7B2FF7]">
                    {tier.price === 0 ? "Free" : `$${tier.price}`}
                  </span>
                </div>
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
        <div className="mx-4 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-white/5">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-zinc-400 font-medium hover:text-white transition-colors border-r border-white/5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Change something
        </button>
        <button
          onClick={onCreate}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 h-12 text-sm text-[#7B2FF7] font-semibold hover:text-white transition-colors"
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
        <div className="rounded-lg bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${pricing.avgGA}</p>
          <p className="text-[9px] text-zinc-500">avg GA in {city}</p>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-2 text-center">
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
  const PLATFORM_FEE = 0.05;
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
    const stripeFees = ticketsSold * STRIPE_FEE_FLAT + gross * STRIPE_FEE_RATE;
    const platformFee = gross * PLATFORM_FEE;
    return { ticketsSold, gross, net: gross - stripeFees - platformFee };
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
            className="flex items-center gap-3 rounded-lg bg-zinc-800/30 px-3 py-2"
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
        <div className="rounded-lg bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${avgPrice.toFixed(0)}</p>
          <p className="text-[9px] text-zinc-500">avg ticket</p>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">{totalCapacity}</p>
          <p className="text-[9px] text-zinc-500">capacity</p>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-2 text-center">
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

// ─── Date/time parsing helpers ───────────────────────────────────────────────

function parseDateTimeFromMessage(message: string): {
  date?: string;
  startTime?: string;
} {
  const result: { date?: string; startTime?: string } = {};
  const lower = message.toLowerCase().trim();

  // ISO date "2026-04-25"
  const isoDate = message.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoDate) result.date = isoDate[1];

  // "april 25", "apr 25"
  if (!result.date) {
    const monthDay = lower.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/
    );
    if (monthDay) {
      const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const m = months[monthDay[1].slice(0, 3)];
      result.date = `2026-${m}-${monthDay[2].padStart(2, "0")}`;
    }
  }

  // Time: "10pm", "10:30 pm"
  const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  let match;
  while ((match = timeRegex.exec(lower)) !== null) {
    let hour = parseInt(match[1]);
    const min = match[2] || "00";
    if (match[3].toLowerCase() === "pm" && hour < 12) hour += 12;
    if (match[3].toLowerCase() === "am" && hour === 12) hour = 0;
    result.startTime = `${hour.toString().padStart(2, "0")}:${min}`;
    break;
  }

  // 24h format "22:00"
  if (!result.startTime) {
    const time24 = lower.match(/\b(\d{2}):(\d{2})\b/);
    if (time24) {
      result.startTime = `${time24[1]}:${time24[2]}`;
    }
  }

  // Implied time "at 10" (assume PM for nightlife)
  if (!result.startTime) {
    const implied = lower.match(
      /(?:at\s+)(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:am|pm))/
    );
    if (implied) {
      let hour = parseInt(implied[1]);
      const min = implied[2] || "00";
      if (hour < 12 && hour >= 1) hour += 12;
      result.startTime = `${hour.toString().padStart(2, "0")}:${min}`;
    }
  }

  return result;
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
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { listening, transcript, startListening, stopListening, clearTranscript } = useSpeech();

  // Auto-submit speech transcript
  useEffect(() => {
    if (transcript && !thinking) {
      setInput(transcript);
      clearTranscript();
      // Submit on next tick so the input state is set
      setTimeout(() => {
        const form = document.getElementById("chat-form") as HTMLFormElement;
        if (form) form.requestSubmit();
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

    try {
      // Let Claude parse whatever the user said — no rigid steps
      const { parseEventDetails } = await import("@/app/actions/ai-parse-event");
      const { parsed, reply } = await parseEventDetails(userMsg, eventData);

      // Merge new data with existing
      const merged = { ...eventData, ...parsed };
      setEventData(merged);

      // Handle ticket tiers from parsed data
      if (parsed.tiers && parsed.tiers.length > 0) {
        setTiers(parsed.tiers);
      } else if (parsed.ticketPrice !== undefined && tiers.length === 0) {
        setTiers([{
          name: parsed.ticketTierName || "General Admission",
          price: parsed.ticketPrice,
          capacity: parsed.ticketQuantity || 100,
        }]);
      }

      setThinking(false);

      // Check what's still missing
      const missing: string[] = [];
      if (!merged.title) missing.push("event name");
      if (!merged.date) missing.push("date");
      if (!merged.startTime) missing.push("time");
      if (!merged.venueName) missing.push("venue");

      if (missing.length === 0) {
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
    field: keyof ParsedEventDetails,
    value: string | number
  ) {
    setEventData((prev) => ({ ...prev, [field]: value }));
  }

  function handleBackToChat() {
    setPhase("chat");
    setStep("name");
    setEventData({});
    setTiers([]);
    setShowVenuePicker(false);
    setMessages([
      {
        role: "ai",
        content: "No problem \u2014 let\u2019s start over. What\u2019s the event called?",
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleCreate() {
    setPhase("creating");
    setError(null);

    const d = eventData;

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

    const result = await createEvent({
      title: d.title || "Untitled Event",
      slug: slugify(d.title || "untitled-event"),
      description: d.description || null,
      date: d.date || new Date().toISOString().split("T")[0],
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
    setPhase("done");
    setTimeout(() => {
      router.push(`/dashboard/events/${result.eventId}`);
      router.refresh();
    }, 2000);
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
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 shrink-0">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-bold font-heading">
          New Event
        </h1>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-[#7B2FF7]/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-[#7B2FF7]" />
          <span className="text-xs font-medium text-[#7B2FF7]">AI</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
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
        {phase === "review" && (
          <EventConfirmationCard
            data={eventData}
            tiers={tiers}
            onUpdate={handleUpdateField}
            onEdit={handleBackToChat}
            onCreate={handleCreate}
            creating={false}
            error={error}
          />
        )}

        {/* Creating state */}
        {phase === "creating" && (
          <div className="ml-11 flex items-center gap-3 animate-fade-in-up">
            <Loader2 className="h-5 w-5 text-[#7B2FF7] animate-spin" />
            <span className="text-sm text-zinc-400">
              Creating your event...
            </span>
          </div>
        )}

        {/* Done state */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold font-heading">
                {eventData.title} is live!
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Taking you to the event dashboard...
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
            className="flex-1 text-sm bg-zinc-900 border-white/10 rounded-full px-4 focus:border-[#7B2FF7]/50 min-h-[44px]"
            disabled={thinking || listening}
          />
          <Button
            type="button"
            size="icon"
            onClick={listening ? stopListening : startListening}
            className={`shrink-0 rounded-full min-h-[44px] min-w-[44px] transition-colors ${
              listening
                ? "bg-red-600 hover:bg-red-700 animate-pulse"
                : "bg-zinc-800 hover:bg-zinc-700 border border-white/10"
            }`}
            disabled={thinking}
          >
            <Mic className={`h-4 w-4 ${listening ? "text-white" : "text-zinc-400"}`} />
          </Button>
          <Button
            type="submit"
            size="icon"
            className="bg-[#7B2FF7] hover:bg-[#6B1FE7] shrink-0 rounded-full min-h-[44px] min-w-[44px]"
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
