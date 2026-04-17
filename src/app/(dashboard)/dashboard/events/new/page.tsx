"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import { type TicketTier } from "@/app/actions/ai-parse-event";
import { getTicketPricingSuggestion, type PricingSuggestion } from "@/app/actions/pricing-suggestion";
import {
  calculateBudget,
  suggestTravel,
  type BudgetResult,
  type BudgetInput,
  type ExpenseItem,
  type ExpenseCategory,
} from "@/app/actions/budget-planner";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { cascadeScenario, cascadeBreakEven, type TicketTierInput } from "@/lib/ticket-forecast";
import { getMyCollectiveDefaults } from "@/app/actions/collective-settings";
import { applyLaunchPlaybook } from "@/app/actions/launch-playbook";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/track";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VenuePicker, { type SelectedVenue } from "@/components/venue-picker";
import {
  Sparkles,
  ArrowLeft,
  Check,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Users,
  Loader2,
  Pencil,
  TrendingUp,
  Target,
  Rocket,
  Zap,
  Megaphone,
  ListChecks,
  SkipForward,
  Plus,
  Trash2,
  DollarSign,
  Music,
  Plane,
  ChevronDown,
  ChevronUp,
  Info,
  AlertCircle,
  Warehouse,
  Sun,
  Mic,
  Home,
  Tent,
} from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Buyer-facing total: organizer keeps the ticket price, buyer pays Nocturn's
// 7% + $0.50 service fee on top at checkout. Nocturn absorbs Stripe processing.
const BUYER_FEE_RATE = 0.07;
const BUYER_FEE_FLAT = 0.50;
function buyerTotal(ticketPrice: number): number {
  if (ticketPrice <= 0) return 0;
  return ticketPrice + ticketPrice * BUYER_FEE_RATE + BUYER_FEE_FLAT;
}

// ─── Budget draft (client-side state shape) ─────────────────────────────────
// The Budget step used to collect a handful of flat numbers (talentFee,
// venueCost, etc.). Now it's itemized with per-row currency so international
// DJ fees in USD can coexist with local venue costs in CAD. `flattenBudget()`
// walks this tree and produces the ExpenseItem[] the server action expects.

interface AmountInCurrency {
  amount: number;
  currency: string; // ISO 4217 lowercase
}

interface BudgetDraft {
  eventCurrency: string; // e.g. "cad"; falls back to collective default, then "usd"
  headliner: {
    type: "local" | "international" | "none";
    origin: string;
    stayNights: number;
    // Number of people traveling (artist + crew). Drives flights / per diem
    // multipliers in the travel estimator. Defaults to 1.
    groupSize: number;
  };
  talentFee: AmountInCurrency;
  // Travel rows only shown for international; amounts may be zero when skipped
  travel: {
    flights: AmountInCurrency;
    hotel: AmountInCurrency;
    transport: AmountInCurrency;
    perDiem: AmountInCurrency;
  };
  // Venue costs are always assumed in the event currency (paid to local vendor)
  venueRental: number;
  barMinimum: number;
  deposit: number;
  // Dynamic rows from the chip-add Production & Marketing section
  prodItems: Array<{
    category: ExpenseCategory;
    label: string;
    amount: number;
    currency: string;
  }>;
}

function defaultBudgetDraft(eventCurrency = "usd"): BudgetDraft {
  return {
    eventCurrency,
    headliner: { type: "none", origin: "", stayNights: 2, groupSize: 1 },
    talentFee: { amount: 0, currency: eventCurrency },
    travel: {
      flights: { amount: 0, currency: eventCurrency },
      hotel: { amount: 0, currency: eventCurrency },
      transport: { amount: 0, currency: eventCurrency },
      perDiem: { amount: 0, currency: eventCurrency },
    },
    venueRental: 0,
    barMinimum: 0,
    deposit: 0,
    prodItems: [],
  };
}

function flattenBudget(draft: BudgetDraft): ExpenseItem[] {
  const items: ExpenseItem[] = [];
  const push = (category: ExpenseCategory, label: string, a: AmountInCurrency) => {
    if (a.amount > 0) items.push({ category, label, amount: a.amount, currency: a.currency });
  };

  if (draft.headliner.type !== "none") {
    push("talent", "Talent fee", draft.talentFee);
  }
  if (draft.headliner.type === "international") {
    push("flights", "Flights", draft.travel.flights);
    push("hotel", "Hotel", draft.travel.hotel);
    push("transport", "Transport", draft.travel.transport);
    push("per_diem", "Per diem", draft.travel.perDiem);
  }
  if (draft.venueRental > 0) {
    items.push({ category: "venue_rental", label: "Venue rental", amount: draft.venueRental, currency: draft.eventCurrency });
  }
  if (draft.deposit > 0) {
    items.push({ category: "deposit", label: "Venue deposit", amount: draft.deposit, currency: draft.eventCurrency });
  }
  for (const p of draft.prodItems) {
    if (p.amount > 0) items.push({ category: p.category, label: p.label, amount: p.amount, currency: p.currency });
  }
  return items;
}

// ─── Draft Persistence ─────────────────────────────────────────────────────

const DRAFT_STORAGE_KEY = "nocturn-event-draft";
const DRAFT_VERSION = 4;

type WizardStep = "details" | "venue" | "tickets" | "budget" | "review";

interface EventFormData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  doorsOpen: string;
  description: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCapacity: number | "";
  isFree: boolean;
  projectedBarSales: number | "";
  barPercent: number | "";
}

interface DraftState {
  version: number;
  step: WizardStep;
  formData: EventFormData;
  tiers: TicketTier[];
  budgetDraft: BudgetDraft;
  budgetResult: BudgetResult | null;
  phase: "wizard" | "creating" | "playbook" | "done";
}

function saveDraft(state: DraftState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...state, version: DRAFT_VERSION }));
  } catch {
    // storage full or unavailable
  }
}

function loadDraft(): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftState;
    if (draft.version !== DRAFT_VERSION) {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      // Version mismatch — old draft is incompatible, silently discard
      return null;
    }
    return draft;
  } catch {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const ALL_STEPS: WizardStep[] = ["details", "venue", "budget", "tickets", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  details: "Details",
  venue: "Venue",
  tickets: "Tickets",
  budget: "Budget",
  review: "Review",
};

// Free events skip the Tickets step entirely
function getSteps(isFree: boolean): WizardStep[] {
  return isFree
    ? (["details", "venue", "budget", "review"] as WizardStep[])
    : ALL_STEPS;
}

const DEFAULT_FORM: EventFormData = {
  title: "",
  date: "",
  startTime: "22:00",
  endTime: "",
  doorsOpen: "",
  description: "",
  venueName: "",
  venueAddress: "",
  venueCity: "",
  venueCapacity: "",
  isFree: false,
  projectedBarSales: "",
  barPercent: "",
};

// ─── Progress Indicator ────────────────────────────────────────────────────

function StepProgress({ current, steps }: { current: WizardStep; steps: WizardStep[] }) {
  const currentIdx = steps.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-xs mx-auto py-4">
      {steps.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-nocturn text-white scale-110 shadow-lg shadow-[#7B2FF7]/30"
                    : isDone
                    ? "bg-nocturn/20 text-nocturn"
                    : "bg-zinc-800 text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] font-medium transition-colors ${
                isActive ? "text-white" : isDone ? "text-nocturn" : "text-muted-foreground"
              }`}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${
                i < currentIdx ? "bg-nocturn/40" : "bg-zinc-800"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Editable Components (for review step) ─────────────────────────────────

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
        className="w-full text-lg font-bold text-white bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-nocturn/50"
      />
    );
  }

  return (
    <div className="group/title">
      <button
        onClick={() => { setEditValue(value); setEditing(true); }}
        className="text-lg font-bold text-foreground flex items-center gap-1.5 text-left hover:text-nocturn-light active:scale-[0.98] transition-all duration-200"
      >
        {value}
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
      </button>
    </div>
  );
}

function EditableRow({
  label,
  value,
  icon: Icon,
  onSave,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-2 group">
      <Icon className="h-3.5 w-3.5 text-nocturn shrink-0" />
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            ref={inputRef}
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
            className="flex-1 min-w-0 bg-zinc-800 border border-white/10 rounded-md px-2 py-1 text-base md:text-sm text-white outline-none focus:border-nocturn/50"
          />
        </div>
      ) : (
        <button
          onClick={() => { setEditValue(value); setEditing(true); }}
          className="flex items-center gap-1.5 text-sm text-left min-w-0 group/row hover:text-nocturn-light active:scale-[0.98] transition-all duration-200 min-h-[44px]"
        >
          <span className="text-zinc-400 shrink-0">{label}:</span>
          <span className="font-medium text-foreground truncate">{value}</span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

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
        className="w-full text-base md:text-sm text-zinc-300 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-nocturn/50 resize-none"
      />
    );
  }

  return (
    <div className="group/desc">
      <button
        onClick={() => { setEditValue(value); setEditing(true); }}
        className="text-sm text-zinc-400 line-clamp-3 text-left flex items-start gap-1.5 hover:text-zinc-300 active:scale-[0.98] transition-all duration-200 min-h-[44px]"
      >
        <span className="flex-1">{value}</span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/desc:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </button>
    </div>
  );
}

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
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
            onBlur={commitEdit}
            className="w-24 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-base md:text-sm text-white outline-none focus:border-nocturn/50"
          />
        ) : (
          <button
            onClick={() => startEdit("name")}
            className="text-sm font-medium text-white hover:text-nocturn-light active:scale-[0.98] transition-all duration-200 group/name flex items-center gap-1 min-h-[44px]"
          >
            {tier.name}
            <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
          </button>
        )}
        {editingField === "capacity" ? (
          <input
            ref={editingField === "capacity" ? inputRef : undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
            onBlur={commitEdit}
            className="w-20 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-base md:text-xs text-white outline-none focus:border-nocturn/50"
          />
        ) : (
          <button
            onClick={() => startEdit("capacity")}
            className="text-xs text-muted-foreground hover:text-zinc-300 active:scale-[0.98] transition-all duration-200 group/cap flex items-center gap-1 min-h-[44px]"
          >
            {tier.capacity} tickets
            <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/cap:opacity-100 transition-opacity" />
          </button>
        )}
      </div>
      {editingField === "price" ? (
        <input
          ref={editingField === "price" ? inputRef : undefined}
          inputMode="decimal"
          pattern="[0-9.]*"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
          onBlur={commitEdit}
          className="w-16 bg-zinc-700 border border-white/10 rounded-md px-2 py-0.5 text-base md:text-sm text-right text-white outline-none focus:border-nocturn/50"
        />
      ) : (
        <button
          onClick={() => startEdit("price")}
          className="active:scale-[0.98] transition-all duration-200 group/price flex flex-col items-end gap-0 min-h-[44px] justify-center"
        >
          <span className="flex items-center gap-1 text-sm font-semibold text-nocturn group-hover/price:text-nocturn-light">
            {tier.price === 0 ? "Free" : `$${tier.price}`}
            <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/price:opacity-100 transition-opacity" />
          </span>
          {tier.price > 0 && (
            <span className="text-[11px] text-muted-foreground/70 leading-tight">
              buyer pays ${buyerTotal(tier.price).toFixed(2)}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Quick Date Picker ───────────────────────────────────────────────────────
// Nightlife-first date entry: "Tonight / Tomorrow / This Fri / This Sat / Next Fri / Next Sat"
// chips on top, native <input type="date"> below as the escape hatch.

function formatLocalYmd(d: Date): string {
  // Local YYYY-MM-DD (avoiding toISOString timezone shift)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getQuickDates(): Array<{ key: string; label: string; sub: string; ymd: string }> {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Upcoming Friday (0=Sun..6=Sat; Fri = 5)
  const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7;
  const thisFri = new Date(today);
  thisFri.setDate(today.getDate() + daysUntilFri);

  // Upcoming Saturday
  const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
  const thisSat = new Date(today);
  thisSat.setDate(today.getDate() + daysUntilSat);

  const nextFri = new Date(thisFri);
  nextFri.setDate(thisFri.getDate() + 7);

  const nextSat = new Date(thisSat);
  nextSat.setDate(thisSat.getDate() + 7);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en", { month: "short", day: "numeric" });

  return [
    { key: "tonight", label: "Tonight", sub: fmt(today), ymd: formatLocalYmd(today) },
    { key: "tomorrow", label: "Tomorrow", sub: fmt(tomorrow), ymd: formatLocalYmd(tomorrow) },
    { key: "this-fri", label: "This Fri", sub: fmt(thisFri), ymd: formatLocalYmd(thisFri) },
    { key: "this-sat", label: "This Sat", sub: fmt(thisSat), ymd: formatLocalYmd(thisSat) },
    { key: "next-fri", label: "Next Fri", sub: fmt(nextFri), ymd: formatLocalYmd(nextFri) },
    { key: "next-sat", label: "Next Sat", sub: fmt(nextSat), ymd: formatLocalYmd(nextSat) },
  ];
}

function QuickDatePicker({ value, onChange }: { value: string; onChange: (ymd: string) => void }) {
  const quickDates = getQuickDates();
  const selectedChip = quickDates.find((q) => q.ymd === value)?.key;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {quickDates.map((q) => {
          const active = selectedChip === q.key;
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => {
                onChange(q.ymd);
                haptic("light");
              }}
              className={`rounded-xl border px-2 py-2.5 text-center transition-all duration-200 min-h-[56px] flex flex-col items-center justify-center active:scale-[0.97] ${
                active
                  ? "border-nocturn bg-nocturn/15 shadow-sm shadow-[#7B2FF7]/20"
                  : "border-white/10 bg-zinc-900 hover:border-nocturn/40 hover:bg-nocturn/5"
              }`}
            >
              <span className={`text-xs font-semibold ${active ? "text-white" : "text-zinc-200"}`}>
                {q.label}
              </span>
              <span className={`text-[11px] mt-0.5 ${active ? "text-nocturn-light" : "text-muted-foreground"}`}>
                {q.sub}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider shrink-0">Or pick a date</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
      />
    </div>
  );
}

// ─── Pricing Insight ─────────────────────────────────────────────────────────

// Cache pricing results across PricingInsight remounts to prevent redundant fetches (#17)
const pricingCache = new Map<string, PricingSuggestion | null>();

function PricingInsight({ city, date, venueCapacity, tiers }: {
  city: string;
  date: string;
  venueCapacity?: number;
  tiers: TicketTier[];
}) {
  const cacheKey = `${city}|${date}`;
  const [pricing, setPricing] = useState<PricingSuggestion | null>(pricingCache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!city || !date) return;
    if (fetchedRef.current === cacheKey) return;
    if (pricingCache.has(cacheKey)) {
      setPricing(pricingCache.get(cacheKey) ?? null);
      fetchedRef.current = cacheKey;
      return;
    }
    fetchedRef.current = cacheKey;
    setLoading(true);
    getTicketPricingSuggestion({ city, date, venueCapacity }).then(({ pricing: p }) => {
      pricingCache.set(cacheKey, p);
      setPricing(p);
      setLoading(false);
    }).catch(() => {
      pricingCache.set(cacheKey, null);
      setPricing(null);
      setLoading(false);
    });
  }, [city, date, venueCapacity, cacheKey]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-nocturn" />
          <div className="h-3 w-32 rounded bg-zinc-800 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="h-10 rounded-xl bg-zinc-800/80 animate-pulse" />
          <div className="h-10 rounded-xl bg-zinc-800/80 animate-pulse" />
        </div>
        <div className="h-3 w-4/5 rounded bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  if (!pricing) return null;

  const userGA = tiers.find(t => t.price > 0 && !t.name.toLowerCase().includes("vip"))?.price ?? 0;
  const diff = userGA - pricing.avgGA;
  const diffLabel = diff > 5 ? "above" : diff < -5 ? "below" : "in line with";
  const diffColor = diff > 5 ? "text-yellow-400" : diff < -5 ? "text-green-400" : "text-green-400";

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-nocturn" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Market Pricing</span>
        <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-full ${
          pricing.confidence === "high" ? "bg-green-500/10 text-green-400" :
          pricing.confidence === "medium" ? "bg-yellow-500/10 text-yellow-400" :
          "bg-zinc-500/10 text-zinc-400"
        }`}>
          {pricing.confidence} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${pricing.avgGA}</p>
          <p className="text-[11px] text-muted-foreground">avg GA in {city}</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${pricing.avgVIP}</p>
          <p className="text-[11px] text-muted-foreground">avg VIP in {city}</p>
        </div>
      </div>

      {userGA > 0 && (
        <p className="text-[11px] text-zinc-400">
          Your GA (<span className="text-white font-medium">${userGA}</span>) is{" "}
          <span className={`font-medium ${diffColor}`}>{diffLabel}</span>{" "}
          the market average.
        </p>
      )}

      {pricing.competingEvents > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {pricing.competingEvents} other event{pricing.competingEvents > 1 ? "s" : ""} this weekend in {city}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground italic">{pricing.suggestion}</p>
    </div>
  );
}

// ─── Inline P&L Forecast (tickets step) ──────────────────────────────────────

function fmtCurrency(n: number, compact?: boolean): string {
  if (compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1)}k`;
  }
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function InlinePnL({ tiers, totalExpenses = 0 }: { tiers: TicketTier[]; totalExpenses?: number }) {
  const rates = [0.5, 0.75, 1.0, 1.25];
  const rateLabels = ["50%", "75%", "Sell-out", "Waitlist"];

  const totalCapacity = tiers.reduce((s, t) => s + t.capacity, 0);

  // Cascade sell-through via the shared helper: Early Bird sells out first,
  // spillover into Tier 1, then Tier 2, then Door. The "Waitlist" column caps
  // at total inventory and surfaces excess demand so operators can see
  // whether they left money on the table.
  const scenarios = rates.map((rate) => {
    const result = cascadeScenario(
      tiers.map((t, i) => ({ name: t.name, price: t.price, capacity: t.capacity, sort_order: i })),
      rate,
    );
    return {
      rate,
      tierLines: result.perTier,
      gross: result.revenue,
      totalSold: result.ticketsSold,
      waitlist: result.waitlistCount,
      profit: result.revenue - totalExpenses,
    };
  });

  const breakEvenIdx = totalExpenses > 0 ? scenarios.findIndex((s) => s.profit >= 0) : 0;

  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <TrendingUp className="h-3.5 w-3.5 text-nocturn" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">P&L Forecast</span>
        <span className="ml-auto text-[11px] text-muted-foreground/70">updates live as you edit tiers</span>
      </div>

      {/* Forecast grid — horizontally scrollable on small screens */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm tabular-nums">
          {/* Column headers */}
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 w-[40%]" />
              {rateLabels.map((label, i) => (
                <th
                  key={i}
                  className={`text-right text-[11px] font-semibold uppercase tracking-wider px-3 py-2 ${
                    i === 2 ? "text-nocturn" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
            {/* Tickets-sold sub-header — cues the operator to the cascade math
                before they read revenue numbers. For the Waitlist column,
                tickets cap at total inventory and we surface waitlist demand
                as a secondary "+N waitlist" note. */}
            <tr className="border-b border-white/[0.06] bg-white/[0.01]">
              <td className="px-4 py-1 text-[11px] text-muted-foreground/70 uppercase tracking-wider">Tickets sold</td>
              {scenarios.map((s, i) => (
                <td key={i} className="text-right px-3 py-1 text-[11px] text-muted-foreground tabular-nums">
                  {s.totalSold}
                  {s.waitlist > 0 && (
                    <span className="text-nocturn/70 ml-1">+{s.waitlist}</span>
                  )}
                </td>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.03]">
            {/* Revenue section header */}
            <tr className="bg-green-500/[0.04]">
              <td colSpan={5} className="px-4 py-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-green-400" />
                  <span className="text-[11px] font-bold text-green-400 uppercase tracking-wider">Revenue</span>
                </div>
              </td>
            </tr>

            {/* Per-tier rows — now showing per-tier sold count for each scenario
                so the cascade behavior is visible (Early Bird fills first, etc.). */}
            {tiers.map((tier, ti) => (
              <tr key={ti} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2">
                  <p className="text-sm font-medium text-foreground truncate">{tier.name}</p>
                  <p className="text-[11px] text-muted-foreground/70">{tier.capacity} tix @ ${tier.price}</p>
                </td>
                {scenarios.map((s, si) => {
                  const line = s.tierLines[ti];
                  return (
                    <td key={si} className="text-right px-3 py-2 text-sm text-green-400">
                      {fmtCurrency(line.revenue)}
                      <span className="block text-[11px] text-muted-foreground/70 tabular-nums">
                        {line.sold}/{line.capacity}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Gross revenue total */}
            <tr className="bg-green-500/[0.04] border-t border-white/[0.06]">
              <td className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Gross Revenue</td>
              {scenarios.map((s, i) => (
                <td key={i} className="text-right px-3 py-2 text-sm font-bold text-green-400">
                  {fmtCurrency(s.gross)}
                </td>
              ))}
            </tr>

            {/* Buyer-paid platform fees note — informational, not deducted from operator */}
            <tr className="bg-nocturn/[0.04]">
              <td colSpan={5} className="px-4 py-1.5">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3 text-nocturn" />
                  <span className="text-[11px] font-medium text-nocturn/90">
                    You keep 100% — buyers cover platform fees at checkout
                  </span>
                </div>
              </td>
            </tr>

            {/* Expenses section (if budget entered) */}
            {totalExpenses > 0 && (
              <>
                <tr className="bg-red-500/[0.04]">
                  <td colSpan={5} className="px-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />
                      <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Expenses</span>
                    </div>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2 text-sm text-muted-foreground">Event costs</td>
                  {scenarios.map((_, i) => (
                    <td key={i} className="text-right px-3 py-2 text-sm text-red-400">
                      ({fmtCurrency(totalExpenses)})
                    </td>
                  ))}
                </tr>
              </>
            )}

            {/* Bottom line — Profit / Net Revenue */}
            <tr className="border-t-2 border-white/[0.08]">
              <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground">
                {totalExpenses > 0 ? "Profit" : "Net Revenue"}
              </td>
              {scenarios.map((s, i) => (
                <td
                  key={i}
                  className={`text-right px-3 py-3 font-bold ${
                    i === 2 ? "text-base" : "text-sm"
                  } ${s.profit >= 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {s.profit < 0 && "−"}{fmtCurrency(Math.abs(s.profit))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer with break-even + note. Using the shared cascade break-even
          helper so "145 tickets into Tier 2" shows up instead of the old
          "~75% capacity" which hid which tier's price actually matters. */}
      {(() => {
        const be = totalExpenses > 0
          ? cascadeBreakEven(
              tiers.map((t, i) => ({ name: t.name, price: t.price, capacity: t.capacity, sort_order: i })),
              totalExpenses,
            )
          : null;
        return (
      <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
        {be && be.achievable ? (
          <p className="text-[11px] text-green-400">
            Break-even at {be.ticketsNeeded} tix
            {be.breakEvenTier && <span className="text-muted-foreground/70"> (inside {be.breakEvenTier} @ ${be.atPrice})</span>}
          </p>
        ) : be && !be.achievable ? (
          <p className="text-[11px] text-red-400">
            Does not break even — raise prices or cut expenses
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">
            Go back to Budget to add expenses and see profit
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/40 shrink-0">
          {totalCapacity} capacity
        </p>
      </div>
        );
      })()}
    </div>
  );
}

// ─── Live Forecast ────────────────────────────────────────────────────────────

function LiveForecast({ tiers, totalExpenses = 0, onTiersUpdate }: { tiers: TicketTier[]; totalExpenses?: number; onTiersUpdate?: (tiers: TicketTier[]) => void }) {
  const [priceMultiplier, setPriceMultiplier] = useState(1.0);
  const baseTiersRef = useRef<TicketTier[]>(tiers);

  useEffect(() => {
    if (priceMultiplier === 1.0) {
      baseTiersRef.current = tiers;
    }
  }, [tiers, priceMultiplier]);

  const totalCapacity = tiers.reduce((s, t) => s + t.capacity, 0);
  const maxRevenue = tiers.reduce((s, t) => s + t.price * t.capacity, 0);
  const avgPrice = totalCapacity > 0 ? maxRevenue / totalCapacity : 0;

  function handleSliderChange(newMultiplier: number) {
    setPriceMultiplier(newMultiplier);
    if (onTiersUpdate) {
      const adjusted = baseTiersRef.current.map((t) => ({
        ...t,
        price: Math.round(t.price * newMultiplier),
      }));
      onTiersUpdate(adjusted);
    }
  }

  // Cascade scenarios — tiers drain in order so Early Bird fills first.
  // Matches the InlinePnL math; was previously flat per-tier which
  // over-forecasted revenue at the 50% scenario by ~25%.
  function calcNet(rate: number) {
    const result = cascadeScenario(
      tiers.map((t, i) => ({ name: t.name, price: t.price, capacity: t.capacity, sort_order: i })),
      rate,
    );
    const gross = result.revenue;
    const profit = gross - totalExpenses;
    return { ticketsSold: result.ticketsSold, gross, net: gross, profit };
  }

  const scenarios = [
    { label: "50% sold", emoji: "\u{1F610}", rate: 0.5 },
    { label: "75% sold", emoji: "\u{1F525}", rate: 0.75 },
    { label: "Sell-out", emoji: "\u{1F680}", rate: 1.0 },
  ];

  const projections = scenarios.map((s) => ({ ...s, ...calcNet(s.rate) }));
  const priceLabels = ["Lower", "Current", "Higher"];
  const priceIndex = priceMultiplier < 1 ? 0 : priceMultiplier > 1 ? 2 : 1;
  const baseTier0Price = baseTiersRef.current[0]?.price || 0;

  // Slider range is 0.5x–2.0x, so the 1.0x "base" sits at 33.3% of the track,
  // not the middle. Position the three tick labels absolutely at their true
  // track positions so "$20 (base)" doesn't look centered when it isn't.
  const basePct = ((1.0 - 0.5) / (2.0 - 0.5)) * 100; // 33.33%

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3">
      {/* Headline row — title, chip, and big profit number share one horizontal
          band so the card feels level instead of three stacked sub-headers. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-nocturn" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Revenue Forecast
            </span>
          </div>
          <p className={`mt-1.5 text-3xl font-bold leading-none ${totalExpenses > 0 ? (projections[2].profit >= 0 ? "text-green-400" : "text-red-400") : "text-white"}`}>
            {totalExpenses > 0
              ? `${projections[2].profit >= 0 ? "" : "-"}${fmtCurrency(projections[2].profit)}`
              : fmtCurrency(projections[2].net)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {totalExpenses > 0
              ? `${fmtCurrency(projections[2].net)} − ${fmtCurrency(totalExpenses)} expenses at sell-out`
              : "max net revenue at sell-out"}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground bg-zinc-800 rounded-full px-2 py-0.5">
          {priceLabels[priceIndex]} pricing
        </span>
      </div>

      {/* Price slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">What if you charge...</span>
          <span className="text-xs font-bold text-nocturn">
            ${avgPrice.toFixed(0)} avg
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={priceMultiplier}
          onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-zinc-800 accent-[#7B2FF7] cursor-pointer"
        />
        <div className="relative h-4 text-[11px] text-muted-foreground">
          <span className="absolute left-0 -translate-x-0">${Math.round(baseTier0Price * 0.5)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${basePct}%` }}>
            ${baseTier0Price} (base)
          </span>
          <span className="absolute right-0 translate-x-0">${Math.round(baseTier0Price * 2)}</span>
        </div>
      </div>

      {priceMultiplier !== 1.0 && (
        <div className="flex flex-wrap gap-1.5">
          {tiers.map((t, i) => (
            <span key={i} className="text-[11px] bg-zinc-800/80 text-zinc-400 rounded-full px-2 py-0.5">
              {t.name}: <span className="text-white font-medium">${t.price}</span>
              <span className="text-muted-foreground line-through ml-1">${baseTiersRef.current[i]?.price ?? t.price}</span>
            </span>
          ))}
        </div>
      )}

      {/* Scenario comparison — emoji + label + value on one flex row, progress
          bar as a full-width thin track beneath so the three rows line up
          horizontally instead of nesting inside a 2-line cell. */}
      <div className="space-y-1.5">
        {projections.map((p) => {
          const displayValue = totalExpenses > 0 ? p.profit : p.net;
          const isLoss = displayValue < 0;
          return (
            <div
              key={p.label}
              className="rounded-xl bg-zinc-800/30 px-3 py-2 space-y-1.5 transition-colors duration-200 hover:bg-zinc-800/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm w-5 text-center shrink-0">{p.emoji}</span>
                <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                  {p.label}
                  <span className="text-muted-foreground/70 ml-1">({p.ticketsSold} tix)</span>
                </span>
                <span className={`text-xs font-bold shrink-0 tabular-nums ${totalExpenses > 0 ? (isLoss ? "text-red-400" : "text-green-400") : "text-white"}`}>
                  {isLoss ? "-" : ""}{fmtCurrency(displayValue)}
                  {totalExpenses > 0 && <span className="text-[11px] text-muted-foreground ml-1 font-normal">{isLoss ? "loss" : "profit"}</span>}
                </span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${p.rate * 100}%`,
                    backgroundColor: totalExpenses > 0
                      ? (isLoss ? "#ef4444" : "#22c55e")
                      : (p.rate >= 1 ? "#7B2FF7" : p.rate >= 0.75 ? "#22c55e" : "#eab308"),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">${avgPrice.toFixed(0)}</p>
          <p className="text-[11px] text-muted-foreground">avg ticket</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          <p className="text-xs font-bold text-white">{totalCapacity}</p>
          <p className="text-[11px] text-muted-foreground">capacity</p>
        </div>
        <div className="rounded-xl bg-zinc-800/50 p-2 text-center">
          {(() => {
            const at75 = totalExpenses > 0 ? projections[1].profit : projections[1].net;
            return (
              <>
                <p className={`text-xs font-bold ${totalExpenses > 0 ? (at75 >= 0 ? "text-green-400" : "text-red-400") : "text-green-400"}`}>
                  {at75 < 0 ? "-" : ""}${Math.abs(at75).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-muted-foreground">@ 75%</p>
              </>
            );
          })()}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {totalExpenses > 0
          ? `Profit = revenue \u2212 $${totalExpenses.toLocaleString()} expenses \u2022 You keep 100%, buyer covers fees`
          : "You keep 100% of ticket price \u2022 Buyer covers platform fees at checkout"}
      </p>
    </div>
  );
}

// ─── Playbook Selector ─────────────────────────────────────────────────────

const PLAYBOOK_ICONS: Record<string, React.ReactNode> = {
  rocket: <Rocket className="h-5 w-5" />,
  zap: <Zap className="h-5 w-5" />,
  megaphone: <Megaphone className="h-5 w-5" />,
  warehouse: <Warehouse className="h-5 w-5" />,
  sun: <Sun className="h-5 w-5" />,
  mic: <Mic className="h-5 w-5" />,
  home: <Home className="h-5 w-5" />,
  tent: <Tent className="h-5 w-5" />,
};

function PlaybookSelector({
  eventTitle: _eventTitle,
  onSelect,
  onSkip,
  applying,
}: {
  eventTitle: string;
  onSelect: (playbookId: string) => void;
  onSkip: () => void;
  applying: boolean;
}) {
  const options = [
    { id: "launch-promote", name: "Launch & Promote", description: "Balanced plan for a standard club night with promo, logistics, and wrap", taskCount: 25, icon: "rocket", recommended: true },
    { id: "lean-launch", name: "Lean Launch", description: "Essential tasks for small, free, or fast-turnaround events", taskCount: 10, icon: "zap", recommended: false },
    { id: "full-campaign", name: "Full Campaign", description: "Everything in Launch & Promote plus press, paid ads, video & influencer outreach", taskCount: 33, icon: "megaphone", recommended: false },
    { id: "warehouse-rave", name: "Warehouse Rave", description: "Location-reveal strategy, underground aesthetic, BYO bar logistics", taskCount: 12, icon: "warehouse", recommended: false },
    { id: "rooftop-day-party", name: "Rooftop Day Party", description: "Weather contingency, sound permits, and golden-hour marketing", taskCount: 10, icon: "sun", recommended: false },
    { id: "ticketed-concert", name: "Ticketed Concert", description: "Headliner-first show with rider, tech pack, and run-of-show", taskCount: 13, icon: "mic", recommended: false },
    { id: "intimate-house-party", name: "Intimate House Party", description: "Invite-only list, personal DMs, and thoughtful hosting", taskCount: 7, icon: "home", recommended: false },
    { id: "multi-day-festival", name: "Multi-Day Festival", description: "Multi-stage production, camping, permits, and phased lineup drops", taskCount: 17, icon: "tent", recommended: false },
  ];

  return (
    <div className="flex flex-col gap-5 py-6 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
            <ListChecks className="h-6 w-6 text-nocturn" />
          </div>
        </div>
        <h2 className="text-lg font-bold font-heading">Set up your launch plan</h2>
        <p className="text-sm text-zinc-400 max-w-xs mx-auto">
          Pick a playbook and we&apos;ll generate a task list with due dates working back from your event.
        </p>
      </div>

      <div className="space-y-2.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            disabled={applying}
            className={`w-full flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
              opt.recommended
                ? "border-nocturn/30 bg-nocturn/5 hover:border-nocturn/50"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
            } ${applying ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              opt.recommended ? "bg-nocturn/20 text-nocturn" : "bg-white/[0.05] text-zinc-400"
            }`}>
              {PLAYBOOK_ICONS[opt.icon] ?? <ListChecks className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">{opt.name}</p>
                {opt.recommended && (
                  <span className="px-1.5 py-0.5 rounded-full bg-nocturn/20 text-nocturn text-[11px] font-semibold">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{opt.description}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{opt.taskCount} tasks with auto-assigned due dates</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onSkip}
        disabled={applying}
        className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-zinc-300 transition-colors min-h-[44px]"
      >
        <SkipForward className="h-3 w-3" />
        Skip — I&apos;ll set up tasks later
      </button>

      {applying && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-nocturn" />
          <span className="text-sm text-zinc-400">Generating your launch plan...</span>
        </div>
      )}
    </div>
  );
}

// ─── Scale Budget Tiers ────────────────────────────────────────────────────

function scaleBudgetTiers(
  suggestedTiers: Array<{ name: string; price: number; capacity: number; reasoning?: string }>,
  userPrice: number | undefined,
  userPriceMax?: number | undefined
): TicketTier[] {
  if (suggestedTiers.length === 0) return [];

  if (userPrice !== undefined && userPriceMax !== undefined && userPrice > 0 && userPriceMax > userPrice) {
    const count = suggestedTiers.length;
    const step = count > 1 ? (userPriceMax - userPrice) / (count - 1) : 0;
    return suggestedTiers.map((t, i) => ({
      name: t.name,
      price: Math.round(userPrice + step * i),
      capacity: t.capacity,
    }));
  }

  if (userPrice === undefined || userPrice <= 0) {
    return suggestedTiers.map((t) => ({ name: t.name, price: t.price, capacity: t.capacity }));
  }

  const baseSuggested = suggestedTiers[0].price;
  if (baseSuggested <= 0) {
    return suggestedTiers.map((t) => ({ name: t.name, price: userPrice, capacity: t.capacity }));
  }
  const ratio = userPrice / baseSuggested;
  return suggestedTiers.map((t) => ({
    name: t.name,
    price: Math.round(t.price * ratio),
    capacity: t.capacity,
  }));
}

// ─── Collapsible Section Helper ────────────────────────────────────────────

function CollapsibleSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors py-1 min-h-[44px]"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && <div className="mt-2 animate-fade-in">{children}</div>}
    </div>
  );
}

// ─── Form Field ────────────────────────────────────────────────────────────

function FormField({ label, icon: Icon, required, children }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
        <Icon className="h-3.5 w-3.5 text-nocturn" />
        {label}
        {required && <span className="text-nocturn text-xs">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Budget Step ────────────────────────────────────────────────────────────
// Multi-currency budget intake. Each expense row has its own currency;
// everything converts to the event's currency at entry time for the P&L math.

interface MoneyRowProps {
  label: string;
  placeholder?: string;
  value: AmountInCurrency;
  onChange: (v: AmountInCurrency) => void;
  eventCurrency: string; // used for the "≈ converted" hint
  Icon?: React.ComponentType<{ className?: string }>;
  onDelete?: () => void;
}

// Controlled numeric input with local string state so typing "0" actually
// shows "0" (instead of the `value || ""` pattern that treated 0 as empty
// and made it impossible to enter zero). Syncs external updates — like the
// auto-fill travel button — back into the text when the parent's number
// diverges from what the user last typed.
function NumberInput({
  value,
  onChange,
  placeholder,
  className,
  inputProps,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  className?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [text, setText] = useState<string>(value > 0 ? String(value) : "");
  const prevExternal = useRef<number>(value);

  useEffect(() => {
    if (value === prevExternal.current) return;
    prevExternal.current = value;
    // Only sync from external if our local text no longer parses to the new value
    // (prevents clobbering intermediate states like "1." → would reset to "1").
    const asNum = parseFloat(text);
    if (asNum !== value) setText(value > 0 ? String(value) : value === 0 ? "" : "");
  }, [value, text]);

  return (
    <Input
      type="number"
      inputMode="decimal"
      placeholder={placeholder ?? "0"}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseFloat(e.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      className={className}
      {...inputProps}
    />
  );
}

function MoneyRow({ label, placeholder, value, onChange, eventCurrency, Icon, onDelete }: MoneyRowProps) {
  // No client-side FX here — we'd need to ship rates to the browser. The
  // "≈ converted" hint fires when the user taps Calculate Budget (result
  // shows resolved local amounts). Keeps the form fast and predictable.
  const showFxHint = value.currency.toLowerCase() !== eventCurrency.toLowerCase() && value.amount > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {Icon && <Icon className="h-3 w-3 text-nocturn" />}
          {label}
        </label>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={`Remove ${label}`}
            className="text-muted-foreground/40 hover:text-red-400 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <NumberInput
          value={value.amount}
          onChange={(n) => onChange({ ...value, amount: n })}
          placeholder={placeholder ?? "0"}
          className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50 flex-1"
        />
        <select
          value={value.currency}
          onChange={(e) => onChange({ ...value, currency: e.target.value })}
          aria-label={`${label} currency`}
          className="bg-zinc-900 border border-white/10 rounded-lg px-2 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[40px] min-w-[72px]"
        >
          {SUPPORTED_CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>
          ))}
        </select>
      </div>
      {showFxHint && (
        <p className="text-[11px] text-muted-foreground/70">
          Converts to {eventCurrency.toUpperCase()} when you tap Calculate
        </p>
      )}
    </div>
  );
}

// Chip-add row definitions for Production & Marketing. One tap adds a row
// with the label + default category prefilled; operator fills amount + currency.
const PROD_CHIPS: Array<{ category: ExpenseCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { category: "ads",             label: "Ads",             icon: Megaphone },
  { category: "graphic_design",  label: "Graphic design",  icon: Sparkles },
  { category: "photo",           label: "Photo",           icon: Sparkles },
  { category: "video",           label: "Video",           icon: Sparkles },
];

interface BudgetStepProps {
  draft: BudgetDraft;
  setDraft: React.Dispatch<React.SetStateAction<BudgetDraft>>;
  result: BudgetResult | null;
  calculating: boolean;
  venueCity: string;
  eventDate: string;
  venueCapacity: number | undefined;
  onSkip: () => void;
  onCalculate: () => void;
  onSuggestTravel: () => void;
  tiers: TicketTier[];
  onApplySuggestedTiers: () => void;
}

function BudgetStep({
  draft, setDraft, result, calculating,
  venueCity, eventDate, venueCapacity,
  onSkip, onCalculate, onSuggestTravel,
  tiers, onApplySuggestedTiers,
}: BudgetStepProps) {
  const ec = draft.eventCurrency;
  // Local "just applied" announcement for the suggested-tiers button. Spells
  // out the prices that landed so the operator doesn't have to bounce to the
  // Tickets step to confirm what changed.
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  const hasAnyExpense =
    draft.talentFee.amount > 0 ||
    draft.venueRental > 0 ||
    draft.deposit > 0 ||
    draft.travel.flights.amount > 0 ||
    draft.travel.hotel.amount > 0 ||
    draft.travel.transport.amount > 0 ||
    draft.travel.perDiem.amount > 0 ||
    draft.prodItems.some(p => p.amount > 0);

  function updateTravel(key: keyof BudgetDraft["travel"], value: AmountInCurrency) {
    setDraft(prev => ({ ...prev, travel: { ...prev.travel, [key]: value } }));
  }

  function addProdItem(category: ExpenseCategory, label: string) {
    setDraft(prev => ({
      ...prev,
      prodItems: [...prev.prodItems, { category, label, amount: 0, currency: prev.eventCurrency }],
    }));
  }

  function addCustomProdItem() {
    addProdItem("other", "Custom expense");
  }

  function updateProdItem(idx: number, partial: Partial<BudgetDraft["prodItems"][number]>) {
    setDraft(prev => ({
      ...prev,
      prodItems: prev.prodItems.map((p, i) => (i === idx ? { ...p, ...partial } : p)),
    }));
  }

  function removeProdItem(idx: number) {
    setDraft(prev => ({ ...prev, prodItems: prev.prodItems.filter((_, i) => i !== idx) }));
  }

  // Which prod chips are still available (already-added ones disappear from the tray).
  const addedCategories = new Set(draft.prodItems.map(p => p.category));
  const availableChips = PROD_CHIPS.filter(c => !addedCategories.has(c.category));

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="text-center space-y-1 pb-2">
        <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
          Budget Planning
        </h2>
        <p className="text-sm text-muted-foreground">Optional — helps forecast profit</p>
      </div>

      {/* Skip shortcut */}
      <button
        onClick={onSkip}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-card p-4 text-sm text-zinc-400 hover:text-zinc-200 hover:border-nocturn/30 transition-all duration-200 active:scale-[0.98]"
      >
        <SkipForward className="h-4 w-4" />
        Skip — I&apos;ll figure out costs later
      </button>

      <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-5">
        {/* Event currency */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <DollarSign className="h-3.5 w-3.5 text-nocturn" />
            Report this event&apos;s budget in
          </label>
          <select
            value={ec}
            onChange={(e) => setDraft(prev => ({ ...prev, eventCurrency: e.target.value }))}
            aria-label="Event currency"
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[44px]"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground/70">
            Totals and profit display in this currency. Individual rows can be entered in any currency.
          </p>
        </div>

        {/* ── Headliner ── */}
        <div className="space-y-2 border-t border-white/5 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <Music className="h-3.5 w-3.5 text-nocturn" />
            Headliner
          </span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Headliner type">
            {([
              { value: "international" as const, label: "International", icon: Plane },
              { value: "local" as const,         label: "Local",         icon: Music },
              { value: "none" as const,          label: "No headliner",  icon: Users },
            ]).map((opt) => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={draft.headliner.type === opt.value}
                onClick={() => setDraft(prev => ({ ...prev, headliner: { ...prev.headliner, type: opt.value } }))}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-200 active:scale-[0.98] min-h-[72px] ${
                  draft.headliner.type === opt.value
                    ? "border-nocturn/40 bg-nocturn/5 text-white"
                    : "border-white/[0.06] bg-zinc-900 text-zinc-400 hover:border-nocturn/30 hover:text-zinc-200"
                }`}
              >
                <opt.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>

          {draft.headliner.type !== "none" && (
            <div className="space-y-3 pt-2 animate-fade-in">
              {draft.headliner.type === "international" && (
                <>
                  <FormField label="Flying from" icon={Plane}>
                    <Input
                      placeholder="London, UK"
                      value={draft.headliner.origin}
                      onChange={(e) => setDraft(prev => ({ ...prev, headliner: { ...prev.headliner, origin: e.target.value } }))}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Stay (nights)" icon={Clock}>
                      <NumberInput
                        value={draft.headliner.stayNights}
                        onChange={(n) => setDraft(prev => ({ ...prev, headliner: { ...prev.headliner, stayNights: n } }))}
                        className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                      />
                    </FormField>
                    <FormField label="Group size" icon={Users}>
                      <NumberInput
                        value={draft.headliner.groupSize}
                        onChange={(n) => setDraft(prev => ({
                          ...prev,
                          headliner: { ...prev.headliner, groupSize: Math.max(1, Math.min(20, Math.floor(n) || 1)) },
                        }))}
                        placeholder="1"
                        className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                      />
                    </FormField>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 -mt-1">
                    Artist + crew. Drives flights / per-diem multipliers in the auto-fill estimate.
                  </p>
                </>
              )}

              <MoneyRow
                label="Talent fee"
                placeholder={draft.headliner.type === "international" ? "2000" : "500"}
                value={draft.talentFee}
                onChange={(v) => setDraft(prev => ({ ...prev, talentFee: v }))}
                eventCurrency={ec}
                Icon={DollarSign}
              />

              {draft.headliner.type === "international" && (
                <>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Travel costs</span>
                    <button
                      type="button"
                      onClick={onSuggestTravel}
                      disabled={!draft.headliner.origin || !venueCity}
                      className="text-xs text-nocturn hover:text-nocturn-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="h-3 w-3 inline mr-1" />
                      Auto-fill estimates
                    </button>
                  </div>
                  <MoneyRow label="Flights"   value={draft.travel.flights}   onChange={(v) => updateTravel("flights", v)}   eventCurrency={ec} />
                  <MoneyRow label="Hotel"     value={draft.travel.hotel}     onChange={(v) => updateTravel("hotel", v)}     eventCurrency={ec} />
                  <MoneyRow label="Transport" value={draft.travel.transport} onChange={(v) => updateTravel("transport", v)} eventCurrency={ec} />
                  <MoneyRow label="Per diem"  value={draft.travel.perDiem}   onChange={(v) => updateTravel("perDiem", v)}   eventCurrency={ec} />
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Venue (all in event currency) ── */}
        <div className="space-y-3 border-t border-white/5 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <Warehouse className="h-3.5 w-3.5 text-nocturn" />
            Venue costs
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Room rental</label>
              <NumberInput
                value={draft.venueRental}
                onChange={(n) => setDraft(prev => ({ ...prev, venueRental: n }))}
                className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Bar minimum</label>
              <NumberInput
                value={draft.barMinimum}
                onChange={(n) => setDraft(prev => ({ ...prev, barMinimum: n }))}
                className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Deposit</label>
              <NumberInput
                value={draft.deposit}
                onChange={(n) => setDraft(prev => ({ ...prev, deposit: n }))}
                className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/70">All in {ec.toUpperCase()} — venue is paid locally.</p>
        </div>

        {/* ── Production & Marketing (chip-add) ── */}
        <div className="space-y-3 border-t border-white/5 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <Megaphone className="h-3.5 w-3.5 text-nocturn" />
            Production &amp; marketing
          </span>

          {/* Added rows */}
          {draft.prodItems.length > 0 && (
            <div className="space-y-3">
              {draft.prodItems.map((p, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Input
                      value={p.label}
                      onChange={(e) => updateProdItem(i, { label: e.target.value })}
                      className="bg-transparent border-0 p-0 text-xs text-muted-foreground focus:outline-none focus:text-white h-auto min-h-0"
                    />
                    <button
                      onClick={() => removeProdItem(i)}
                      aria-label={`Remove ${p.label}`}
                      className="text-muted-foreground/40 hover:text-red-400 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <NumberInput
                      value={p.amount}
                      onChange={(n) => updateProdItem(i, { amount: n })}
                      className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50 flex-1"
                    />
                    <select
                      value={p.currency}
                      onChange={(e) => updateProdItem(i, { currency: e.target.value })}
                      aria-label={`${p.label} currency`}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[40px] min-w-[72px]"
                    >
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chip tray */}
          {(availableChips.length > 0 || true) && (
            <div className="flex flex-wrap gap-2">
              {availableChips.map((c) => (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => addProdItem(c.category, c.label)}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-nocturn/40 hover:bg-nocturn/10 hover:text-white transition-all active:scale-[0.97] min-h-[44px]"
                >
                  <Plus className="h-3 w-3" />
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={addCustomProdItem}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-nocturn/40 hover:bg-nocturn/10 hover:text-white transition-all active:scale-[0.97] min-h-[44px]"
              >
                <Plus className="h-3 w-3" />
                Custom
              </button>
            </div>
          )}

          {draft.prodItems.length === 0 && (
            <p className="text-[11px] text-muted-foreground/70">Tap a chip to add — ads, photographer, flyer designer, etc.</p>
          )}
        </div>

        {/* Calculate */}
        <Button
          onClick={onCalculate}
          disabled={calculating || !hasAnyExpense}
          className="w-full bg-nocturn hover:bg-[#6B1FE7] text-white rounded-xl min-h-[44px] transition-all duration-200 active:scale-[0.98]"
        >
          {calculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
          Calculate Budget
        </Button>

        {/* Result */}
        {result && (
          <div className="rounded-xl bg-zinc-800/50 p-4 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Budget Summary</span>
              <span className="text-sm font-bold text-white">
                {result.totalExpenses.toLocaleString()} {result.eventCurrency.toUpperCase()}
              </span>
            </div>

            {/* Per-line-item breakdown with original currency visible */}
            {result.resolvedItems.length > 0 && (
              <div className="space-y-1 pt-1">
                {result.resolvedItems.map((it, i) => {
                  const converted = it.currency !== it.local_currency;
                  return (
                    <div key={i} className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{it.label}</span>
                      <span>
                        {converted && (
                          <span className="text-muted-foreground/70 mr-1">
                            {it.amount.toLocaleString()} {it.currency.toUpperCase()} →
                          </span>
                        )}
                        <span className="text-zinc-300">
                          {Math.round(it.local_amount).toLocaleString()} {it.local_currency.toUpperCase()}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-zinc-400 pt-1">
              Break-even: <span className="text-white font-medium">{result.breakEven.ticketsNeeded} tickets</span> at {result.breakEven.atPrice} {result.eventCurrency.toUpperCase()}
            </p>

            <div className="space-y-1">
              {result.scenarios.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className={`font-medium ${s.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {s.profit >= 0 ? "+" : ""}{s.profit.toLocaleString()} {result.eventCurrency.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            {result.suggestedTiers.length > 0 && tiers.length > 0 && (
              <button
                onClick={() => {
                  const note = result.suggestedTiers
                    .map((t) => `${t.name} ${result.eventCurrency.toUpperCase()} ${t.price} (${t.capacity} tix)`)
                    .join(" · ");
                  onApplySuggestedTiers();
                  setAppliedNote(note);
                  setTimeout(() => setAppliedNote(null), 7000);
                }}
                className="text-xs text-nocturn hover:text-nocturn-light transition-colors"
              >
                Apply suggested tiers ({result.suggestedTiers.length} tiers)
              </button>
            )}

            {appliedNote && (
              <div className="rounded-xl bg-nocturn/10 border border-nocturn/30 px-3 py-2 text-[11px] text-nocturn animate-fade-in">
                <span className="font-semibold">Applied:</span> {appliedNote}
              </div>
            )}
          </div>
        )}

        {/* Market pricing sanity-check — sits next to the cost-plus suggestion
            so operators don't anchor on expense-driven prices without seeing
            what the local market is actually charging. */}
        {result && venueCity && eventDate && result.suggestedTiers.length > 0 && (
          <PricingInsight
            city={venueCity}
            date={eventDate}
            venueCapacity={venueCapacity}
            tiers={result.suggestedTiers.map(t => ({ name: t.name, price: t.price, capacity: t.capacity }))}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("details");
  const [formData, setFormData] = useState<EventFormData>(DEFAULT_FORM);
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [budgetDraft, setBudgetDraft] = useState<BudgetDraft>(() => defaultBudgetDraft());
  const [budgetResult, setBudgetResult] = useState<BudgetResult | null>(null);
  const [phase, setPhase] = useState<"wizard" | "creating" | "playbook" | "done">("wizard");
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [applyingPlaybook, setApplyingPlaybook] = useState(false);
  const [venueMode, setVenueMode] = useState<"picker" | "manual">("picker");
  const [calculatingBudget, setCalculatingBudget] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflight, setPreflight] = useState<"loading" | "ok" | "no-auth" | "no-collective">("loading");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [visitedReview, setVisitedReview] = useState(false);
  const [_successBanner, _setSuccessBanner] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth + collective preflight check ──
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) { setPreflight("no-auth"); return; }
        const { count } = await supabase
          .from("collective_members")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("deleted_at", null);
        if (cancelled) return;
        if (!count || count === 0) { setPreflight("no-collective"); return; }
        setPreflight("ok");
      } catch {
        if (!cancelled) setPreflight("no-auth");
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  // Restore draft on mount. If no draft, fetch the collective's default
  // currency so the budget step starts in the right unit (CAD for Toronto etc.)
  // rather than USD.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setStep(draft.step);
      setFormData(draft.formData);
      setTiers(draft.tiers);
      setBudgetDraft(draft.budgetDraft);
      setBudgetResult(draft.budgetResult);
      setPhase(draft.phase === "creating" || draft.phase === "playbook" ? "wizard" : draft.phase);
      setDraftLoaded(true);
      return;
    }
    // Fresh wizard — seed event currency from collective default.
    getMyCollectiveDefaults()
      .then((defaults) => {
        const cc = defaults?.defaultCurrency ?? "usd";
        setBudgetDraft((prev) => defaultBudgetDraft(cc) === prev ? prev : defaultBudgetDraft(cc));
      })
      .catch(() => {
        // Stays on USD default, non-blocking.
      })
      .finally(() => setDraftLoaded(true));
  }, []);

  // Save draft on changes
  const saveDraftDebounced = useCallback(() => {
    const timer = setTimeout(() => {
      if (phase === "done" || phase === "playbook") return;
      saveDraft({ version: DRAFT_VERSION, step, formData, tiers, budgetDraft, budgetResult, phase });
    }, 500);
    return timer;
  }, [step, formData, tiers, budgetDraft, budgetResult, phase]);

  useEffect(() => {
    const timer = saveDraftDebounced();
    return () => clearTimeout(timer);
  }, [saveDraftDebounced]);

  // Warn before leaving with unsaved data
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (phase === "wizard" && (formData.title || formData.venueName)) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase, formData.title, formData.venueName]);

  // Helpers
  function updateForm(updates: Partial<EventFormData>) {
    setFormData((prev) => ({ ...prev, ...updates }));
  }

  function goTo(nextStep: WizardStep) {
    setStep(nextStep);
    if (nextStep === "review") setVisitedReview(true);
    trackEvent("wizard_step", { step: nextStep });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeSteps = getSteps(formData.isFree);
  // If the user just toggled to free while sitting on the tickets step, bounce them forward.
  // useEffect would be cleaner but this guard prevents an out-of-range index on the very next render.
  const safeStep: WizardStep = activeSteps.includes(step) ? step : "venue";
  const currentIdx = activeSteps.indexOf(safeStep);

  function goNext() {
    if (currentIdx < activeSteps.length - 1) goTo(activeSteps[currentIdx + 1]);
  }

  function goBack() {
    if (currentIdx > 0) goTo(activeSteps[currentIdx - 1]);
  }

  // Total expenses in the event's currency. Only reflects values *after* the
  // Calculate Budget button has been tapped — before that, FX conversion hasn't
  // happened and summing native-currency numbers would mix units.
  // Bar minimum is a revenue threshold, not an expense (matches server logic).
  const totalExpenses = budgetResult?.totalExpenses ?? 0;

  // Validation per step
  function canAdvance(): boolean {
    switch (step) {
      case "details": {
        if (!formData.title.trim() || !formData.date) return false;
        // Block past dates at step 1 instead of waiting for server rejection
        const picked = new Date(formData.date + "T23:59:59");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (picked < today) return false;
        return true;
      }
      case "venue":
        return !!formData.venueName.trim() && !!formData.venueCity.trim() && (typeof formData.venueCapacity === "number" && formData.venueCapacity > 0);
      case "tickets":
        // Free mode skips this step entirely, so we only ever hit this for paid.
        return tiers.length > 0 && tiers.every((t) => t.price >= 0 && t.capacity > 0);
      case "budget":
        return true; // always skippable
      case "review":
        return true;
      default:
        return false;
    }
  }

  // Inline validation hints
  const dateInPast = (() => {
    if (!formData.date) return false;
    const picked = new Date(formData.date + "T23:59:59");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return picked < today;
  })();

  // Handle venue selection from picker
  function handleVenueSelect(venue: SelectedVenue) {
    updateForm({
      venueName: venue.name,
      venueAddress: venue.address,
      venueCity: venue.city,
      venueCapacity: venue.capacity,
    });
    setVenueMode("manual"); // show the filled fields
  }

  // Auto-seed default tiers when user lands on tickets step with none
  useEffect(() => {
    if (step === "tickets" && !formData.isFree && tiers.length === 0) {
      const capacity = typeof formData.venueCapacity === "number" ? formData.venueCapacity : 100;
      setTiers([
        { name: "Early Bird", price: 20, capacity: Math.round(capacity * 0.3) },
        { name: "General Admission", price: 30, capacity: Math.round(capacity * 0.5) },
        { name: "Door", price: 40, capacity: Math.round(capacity * 0.2) },
      ]);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate tiers from a price or price range
  function generateTiersFromPrice(priceStr: string) {
    const capacity = typeof formData.venueCapacity === "number" ? formData.venueCapacity : 100;

    // Check for range pattern: $20-$50, $20 - $50, $20 to $50
    const rangeMatch = priceStr.match(/\$?(\d+)\s*(?:-|–|to)\s*\$?(\d+)/);
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1]);
      const high = parseInt(rangeMatch[2]);
      if (low > 0 && high > low) {
        const mid = Math.round((low + high) / 2);
        setTiers([
          { name: "Early Bird", price: low, capacity: Math.round(capacity * 0.3) },
          { name: "General Admission", price: mid, capacity: Math.round(capacity * 0.5) },
          { name: "Door", price: high, capacity: Math.round(capacity * 0.2) },
        ]);
        return;
      }
    }

    // Single price
    const singleMatch = priceStr.match(/\$?(\d+)/);
    if (singleMatch) {
      const price = parseInt(singleMatch[1]);
      if (price > 0) {
        setTiers([
          { name: "Early Bird", price: Math.round(price * 0.8), capacity: Math.round(capacity * 0.3) },
          { name: "General Admission", price, capacity: Math.round(capacity * 0.5) },
          { name: "Door", price: Math.round(price * 1.3), capacity: Math.round(capacity * 0.2) },
        ]);
        return;
      }
    }
  }

  // Calculate budget. Walks the BudgetDraft into flat ExpenseItems, sends to
  // the server action which performs FX conversion and returns a resolved
  // list + suggested tier prices.
  async function handleCalculateBudget() {
    setCalculatingBudget(true);
    setError(null);
    try {
      const input: BudgetInput = {
        eventCurrency: budgetDraft.eventCurrency,
        headlinerType: budgetDraft.headliner.type,
        headlinerOrigin: budgetDraft.headliner.origin || undefined,
        stayNights: budgetDraft.headliner.stayNights,
        items: flattenBudget(budgetDraft),
        barMinimum: budgetDraft.barMinimum || undefined,
        venueCity: formData.venueCity,
        venueCapacity: typeof formData.venueCapacity === "number" ? formData.venueCapacity : undefined,
        date: formData.date,
      };
      const result = await calculateBudget(input);
      setBudgetResult(result);

      // Auto-update tiers if budget suggests them and user has no tiers yet
      if (result.suggestedTiers.length > 0 && tiers.length === 0) {
        const scaled = scaleBudgetTiers(result.suggestedTiers, undefined);
        setTiers(scaled);
      }
    } catch {
      setError("Could not calculate budget — try again or skip this step.");
    } finally {
      setCalculatingBudget(false);
    }
  }

  // Auto-fill the four travel rows (flights/hotel/transport/per-diem) from
  // origin + venue city + nights. Server converts estimates to event currency.
  async function handleSuggestTravel() {
    if (!budgetDraft.headliner.origin || !formData.venueCity) return;
    try {
      const s = await suggestTravel({
        headlinerOrigin: budgetDraft.headliner.origin,
        venueCity: formData.venueCity,
        stayNights: budgetDraft.headliner.stayNights,
        eventCurrency: budgetDraft.eventCurrency,
        groupSize: budgetDraft.headliner.groupSize,
      });
      setBudgetDraft(prev => ({
        ...prev,
        travel: {
          flights:   { amount: s.flights,   currency: s.currency },
          hotel:     { amount: s.hotel,     currency: s.currency },
          transport: { amount: s.transport, currency: s.currency },
          perDiem:   { amount: s.perDiem,   currency: s.currency },
        },
      }));
    } catch {
      // Silent: operator can still type numbers manually
    }
  }

  // Create event
  async function handleCreate() {
    if (isSubmitting) return; // guard double-submit
    setError(null);

    if (!formData.date) {
      setError("Please specify a date for your event.");
      return;
    }

    // Ensure at least one tier for paid events
    if (!formData.isFree && tiers.length === 0) {
      setError("Add at least one ticket tier, or mark this as a free event.");
      return;
    }

    setIsSubmitting(true);
    setPhase("creating");

    let validTiers: { name: string; price: number; quantity: number }[] = [];
    if (!formData.isFree && tiers.length > 0) {
      validTiers = tiers.map((t) => ({
        name: t.name,
        price: t.price,
        quantity: t.capacity,
      }));
    } else if (formData.isFree) {
      validTiers = [{ name: "Free", price: 0, quantity: typeof formData.venueCapacity === "number" ? formData.venueCapacity : 100 }];
    }

    try {
      const result = await createEvent({
        title: formData.title || "Untitled Event",
        slug: slugify(formData.title || "untitled-event"),
        description: formData.description || null,
        date: formData.date,
        doorsOpen: formData.doorsOpen || null,
        startTime: formData.startTime || "22:00",
        endTime: formData.endTime || null,
        venueName: formData.venueName || "TBA",
        venueAddress: formData.venueAddress || null,
        venueCity: formData.venueCity || "",
        venueCapacity: typeof formData.venueCapacity === "number" ? formData.venueCapacity : 0,
        tiers: validTiers,
        eventMode: formData.isFree ? "rsvp" : "ticketed",
        isFree: formData.isFree,
        // Event currency = per-event override; createEvent falls back to the
        // collective's default_currency if null.
        currency: budgetDraft.eventCurrency,
        // Venue cost + deposit are authoritatively stored on events.venue_cost
        // and events.venue_deposit columns (not in the expenses table). The
        // wizard's local state carries them as scalar fields in the event
        // currency; passing them here keeps the P&L's profit math working
        // without requiring the itemized list to carry them too.
        barMinimum: budgetDraft.barMinimum || null,
        venueCost: budgetDraft.venueRental || null,
        venueDeposit: budgetDraft.deposit || null,
        // Itemized expense rows — EXCLUDING venue_rental + deposit. Those
        // are already carried by venueCost / venueDeposit scalar fields
        // above; writing them to expenses too would double-count in the
        // finance P&L (which subtracts both the column AND the expenses sum).
        expenseItems: budgetResult?.resolvedItems
          ? budgetResult.resolvedItems.filter(
              (it) => it.category !== "venue_rental" && it.category !== "deposit",
            )
          : null,
      });

      if (result.error) {
        setError(result.error);
        setPhase("wizard");
        setIsSubmitting(false);
        // Scroll error into view
        setTimeout(() => document.getElementById("wizard-error")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        return;
      }

      haptic("success");
      clearDraft();
      setCreatedEventId(result.eventId ?? null);
      // Refresh cached route data before showing playbook so the redirect won't race with revalidation (#39)
      router.refresh();
      setPhase("playbook");
    } catch {
      setError("Network error — please try again.");
      setPhase("wizard");
      setIsSubmitting(false);
    }
  }

  // Format time for display
  function formatTime(t: string): string {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function formatDate(d: string): string {
    if (!d) return "";
    try {
      const date = new Date(d + "T12:00:00");
      return date.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    } catch {
      return d;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current); };
  }, []);

  // Playbook phase
  if (phase === "playbook") {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 animate-fade-in">
        {/* Playbook error banner */}
        {error && (
          <div className="mb-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-400 text-center">
            {error} — your event was still created successfully.
          </div>
        )}
        <PlaybookSelector
          eventTitle={formData.title || "Your event"}
          onSelect={async (playbookId) => {
            if (!createdEventId) return;
            setApplyingPlaybook(true);
            setError(null);
            try {
              const result = await applyLaunchPlaybook(createdEventId, playbookId);
              setApplyingPlaybook(false);
              if (result.error) {
                setError(result.error);
                // Don't block navigation — event exists, playbook is optional
              }
            } catch {
              setApplyingPlaybook(false);
              setError("Could not apply playbook — you can add tasks manually later.");
            }
            setPhase("done");
            redirectTimerRef.current = setTimeout(() => {
              router.push(`/dashboard/events/${createdEventId}/tasks`);
              router.refresh();
            }, 1500);
          }}
          onSkip={() => {
            setPhase("done");
            redirectTimerRef.current = setTimeout(() => {
              router.push(`/dashboard/events/${createdEventId}`);
              router.refresh();
            }, 1500);
          }}
          applying={applyingPlaybook}
        />
        {/* Skip straight to event if user doesn't want a playbook */}
        {!applyingPlaybook && (
          <div className="text-center mt-2">
            <button
              onClick={() => router.push(`/dashboard/events/${createdEventId}`)}
              className="text-xs text-muted-foreground hover:text-zinc-400 transition-colors"
            >
              Go to event dashboard directly
            </button>
          </div>
        )}
      </div>
    );
  }

  // Done phase
  if (phase === "done") {
    return (
      <div className="mx-auto max-w-lg flex flex-col items-center gap-4 py-24 animate-scale-in">
        {error && (
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-400 text-center max-w-xs">
            {error}
          </div>
        )}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 animate-pulse">
          <Check className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold font-heading truncate max-w-full px-4">
            {formData.title} — draft created!
          </h2>
          <p className="text-sm text-zinc-400 mt-1">Taking you to the event dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Preflight gates ──
  // Wait for both auth preflight AND draft restoration before rendering form (#3 — prevents empty flash)
  if (preflight === "loading" || !draftLoaded) {
    return (
      <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)] animate-fade-in px-1 overflow-hidden">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 pb-2 shrink-0">
          <div className="h-11 w-11 rounded-xl bg-zinc-900 animate-pulse" />
          <div className="h-6 w-32 rounded-md bg-zinc-900 animate-pulse" />
        </div>
        {/* Step progress skeleton */}
        <div className="flex items-center justify-center gap-0 w-full max-w-xs mx-auto py-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 rounded-full bg-zinc-900 animate-pulse" />
                <div className="h-2 w-10 rounded bg-zinc-900 animate-pulse" />
              </div>
              {i < 4 && <div className="h-0.5 flex-1 mx-1 rounded-full bg-zinc-900" />}
            </div>
          ))}
        </div>
        {/* Card skeleton */}
        <div className="flex-1 overflow-hidden space-y-5 pt-2">
          <div className="space-y-2 text-center">
            <div className="h-6 w-40 rounded-md bg-zinc-900 animate-pulse mx-auto" />
            <div className="h-4 w-28 rounded-md bg-zinc-900 animate-pulse mx-auto" />
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card p-4 space-y-3">
            <div className="h-3 w-20 rounded bg-zinc-900 animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-[72px] rounded-xl bg-zinc-900 animate-pulse" />
              <div className="h-[72px] rounded-xl bg-zinc-900 animate-pulse" />
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-4">
            <div className="h-11 rounded-xl bg-zinc-900 animate-pulse" />
            <div className="h-11 rounded-xl bg-zinc-900 animate-pulse" />
            <div className="h-11 rounded-xl bg-zinc-900 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (preflight === "no-auth") {
    return (
      <div className="mx-auto max-w-lg flex flex-col items-center gap-4 py-24 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-bold">Session expired</p>
          <p className="text-sm text-zinc-400">Please log in again to create an event.</p>
        </div>
        <Link href="/login">
          <Button className="bg-nocturn hover:bg-nocturn-light min-h-[44px]">Log in</Button>
        </Link>
      </div>
    );
  }

  if (preflight === "no-collective") {
    return (
      <div className="mx-auto max-w-lg flex flex-col items-center gap-4 py-24 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nocturn/10">
          <Users className="h-8 w-8 text-nocturn" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-bold">No collective yet</p>
          <p className="text-sm text-zinc-400 max-w-[280px]">
            You need a collective before you can create events. Set one up first.
          </p>
        </div>
        <Link href="/onboarding">
          <Button className="bg-nocturn hover:bg-nocturn-light min-h-[44px]">Create a Collective</Button>
        </Link>
      </div>
    );
  }

  // Creating phase
  if (phase === "creating") {
    return (
      <div className="mx-auto max-w-lg flex flex-col items-center gap-4 py-24 animate-fade-in">
        <Loader2 className="h-10 w-10 animate-spin text-nocturn" />
        <p className="text-sm text-zinc-400">Creating your event...</p>
        <p className="text-[11px] text-muted-foreground">This may take a moment while we enrich your event page with AI</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)] animate-fade-in overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 shrink-0 px-1">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] hover:bg-accent active:scale-95 transition-all duration-200"
          aria-label="Back to events"
          onClick={() => {
            if (formData.title || formData.venueName) {
              setShowExitModal(true);
            } else {
              clearDraft();
              router.push("/dashboard/events");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold font-heading truncate">New Event</h1>
        {(formData.title || formData.venueName) && (
          <button
            onClick={() => setShowResetModal(true)}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-zinc-300 transition-colors duration-200 px-2 py-1 rounded-md hover:bg-white/[0.04]"
          >
            Start over
          </button>
        )}
      </div>

      {/* Exit confirmation modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12111a] p-5 space-y-4 animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">Leave event creation?</h3>
              <p className="text-sm text-zinc-400">You have unsaved progress.</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Draft is already auto-saved, just navigate away
                  setShowExitModal(false);
                  router.push("/dashboard/events");
                }}
                className="w-full rounded-xl bg-nocturn px-4 py-3 min-h-[44px] text-sm font-semibold text-white transition-colors hover:bg-[#6B1FE7] active:scale-[0.98]"
              >
                Save Draft & Leave
              </button>
              <button
                onClick={() => {
                  clearDraft();
                  setShowExitModal(false);
                  router.push("/dashboard/events");
                }}
                className="w-full rounded-xl bg-white/5 px-4 py-3 min-h-[44px] text-sm font-medium text-red-400 transition-colors hover:bg-white/10 active:scale-[0.98]"
              >
                Discard & Leave
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full rounded-xl px-4 py-3 min-h-[44px] text-sm font-medium text-zinc-400 transition-colors hover:text-white active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start over confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12111a] p-5 space-y-4 animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">Start over?</h3>
              <p className="text-sm text-zinc-400">This will clear all your progress.</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  clearDraft();
                  setFormData(DEFAULT_FORM);
                  setTiers([]);
                  setBudgetDraft(defaultBudgetDraft(budgetDraft.eventCurrency));
                  setBudgetResult(null);
                  setStep("details");
                  setError(null);
                  setVenueMode("picker");
                  setShowResetModal(false);
                }}
                className="w-full rounded-xl bg-red-500/20 px-4 py-3 min-h-[44px] text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/30 active:scale-[0.98]"
              >
                Yes, Start Over
              </button>
              <button
                onClick={() => setShowResetModal(false)}
                className="w-full rounded-xl px-4 py-3 min-h-[44px] text-sm font-medium text-zinc-400 transition-colors hover:text-white active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <StepProgress current={step} steps={activeSteps} />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-1 pb-44 md:pb-32 min-h-0">
        {/* ── STEP 1: Event Details ── */}
        {step === "details" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Event Details
              </h2>
              <p className="text-sm text-muted-foreground">What&apos;s the event?</p>
            </div>

            {/* Mode selector — free RSVP vs ticketed. This is the single most
                important decision in the wizard, so it lives at the top. */}
            <div className="rounded-2xl border border-white/[0.06] bg-card p-4">
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">Event type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updateForm({ isFree: true });
                    setTiers([]);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] min-h-[72px] ${
                    formData.isFree
                      ? "border-nocturn bg-nocturn/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-nocturn" />
                    <span className="text-sm font-semibold text-white">Free · RSVP</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">Collect Yes/Maybe/No RSVPs. No tickets, no fees.</p>
                </button>
                <button
                  type="button"
                  onClick={() => updateForm({ isFree: false })}
                  className={`rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] min-h-[72px] ${
                    !formData.isFree
                      ? "border-nocturn bg-nocturn/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Ticket className="h-4 w-4 text-nocturn" />
                    <span className="text-sm font-semibold text-white">Ticketed</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">Sell tickets with Stripe. Multiple price tiers.</p>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-4">
              <FormField label="Event Name" icon={Sparkles} required>
                <Input
                  placeholder="Midnight Sessions Vol. 4"
                  value={formData.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                  maxLength={200}
                  className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                  autoFocus
                />
                {formData.title.length > 150 && (
                  <p className={`text-[11px] text-right ${formData.title.length > 190 ? "text-yellow-400" : "text-muted-foreground"}`}>
                    {formData.title.length}/200
                  </p>
                )}
              </FormField>

              <FormField label="Date" icon={Calendar} required>
                <QuickDatePicker
                  value={formData.date}
                  onChange={(d) => updateForm({ date: d })}
                />
                {dateInPast && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="h-3 w-3" />
                    Date is in the past — pick a future date
                  </p>
                )}
              </FormField>

              <FormField label="Start Time" icon={Clock} required>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => updateForm({ startTime: e.target.value })}
                  className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                />
                {formData.startTime === "22:00" && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">Default: 10 PM — adjust if needed</p>
                )}
              </FormField>

              {/* Optional fields */}
              <CollapsibleSection label="Add doors time, end time, or description" defaultOpen={showOptionalDetails || !!formData.endTime || !!formData.doorsOpen || !!formData.description}>
                <div className="space-y-4">
                  <FormField label="Doors Open" icon={Clock}>
                    <Input
                      type="time"
                      value={formData.doorsOpen}
                      onChange={(e) => { updateForm({ doorsOpen: e.target.value }); setShowOptionalDetails(true); }}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                    />
                  </FormField>

                  <FormField label="End Time" icon={Clock}>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => { updateForm({ endTime: e.target.value }); setShowOptionalDetails(true); }}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                    />
                    {formData.endTime && formData.startTime && formData.endTime < formData.startTime && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Ends after midnight (next day)</p>
                    )}
                  </FormField>

                  <FormField label="Description" icon={Info}>
                    <textarea
                      placeholder="Tell people what to expect..."
                      value={formData.description}
                      onChange={(e) => { updateForm({ description: e.target.value }); setShowOptionalDetails(true); }}
                      maxLength={5000}
                      rows={3}
                      className="flex w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-nocturn/50 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[44px] transition-colors"
                    />
                  </FormField>
                </div>
              </CollapsibleSection>
            </div>
          </div>
        )}

        {/* ── STEP 2: Venue ── */}
        {step === "venue" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Venue
              </h2>
              <p className="text-sm text-muted-foreground">Where&apos;s it happening?</p>
            </div>

            {venueMode === "picker" && !formData.venueName ? (
              <VenuePicker
                onSelect={handleVenueSelect}
                onCustom={() => setVenueMode("manual")}
              />
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-4">
                {/* Switch back to picker */}
                {formData.venueName && (
                  <button
                    onClick={() => {
                      updateForm({ venueName: "", venueAddress: "", venueCity: "", venueCapacity: "" });
                      setVenueMode("picker");
                    }}
                    className="text-xs text-nocturn hover:text-nocturn-light transition-colors"
                  >
                    Choose a different venue
                  </button>
                )}

                <FormField label="Venue Name" icon={MapPin} required>
                  <Input
                    placeholder="CODA"
                    value={formData.venueName}
                    onChange={(e) => updateForm({ venueName: e.target.value })}
                    maxLength={200}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                    autoFocus={!formData.venueName}
                  />
                </FormField>

                <FormField label="Address" icon={MapPin}>
                  <Input
                    placeholder="794 Bathurst St"
                    value={formData.venueAddress}
                    onChange={(e) => updateForm({ venueAddress: e.target.value })}
                    maxLength={500}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                  />
                </FormField>

                <FormField label="City" icon={MapPin} required>
                  <Input
                    placeholder="Toronto"
                    value={formData.venueCity}
                    onChange={(e) => updateForm({ venueCity: e.target.value })}
                    maxLength={100}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                  />
                </FormField>

                <FormField label="Capacity" icon={Users} required>
                  <Input
                    type="number"
                    placeholder="200"
                    value={formData.venueCapacity === "" ? "" : formData.venueCapacity}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = parseInt(val);
                      if (val === "") { updateForm({ venueCapacity: "" }); return; }
                      if (!isNaN(num) && num <= 100000) updateForm({ venueCapacity: num });
                    }}
                    min={1}
                    max={100000}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-nocturn/50"
                  />
                </FormField>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Tickets & Pricing ── */}
        {step === "tickets" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Tickets & Pricing
              </h2>
              <p className="text-sm text-muted-foreground">How much are tickets?</p>
            </div>

            {/* Attribution: tiers were suggested from the budget step */}
            {budgetResult && budgetResult.suggestedTiers.length > 0 && tiers.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-nocturn/20 bg-nocturn/[0.05] px-3 py-2.5 animate-fade-in">
                <Sparkles className="h-3.5 w-3.5 text-nocturn shrink-0 mt-0.5" />
                <p className="text-[12px] text-zinc-300 leading-snug">
                  Tiers suggested from your ${totalExpenses.toLocaleString()} budget. Edit freely.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-5">
              {/* Mode reminder + shortcut */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Paid event · ticketed</span>
                <button
                  type="button"
                  onClick={() => goTo("details")}
                  className="text-nocturn hover:text-nocturn-light transition-colors"
                >
                  Change to free
                </button>
              </div>

              {/* Tier list — pill-style, tap to edit */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5 text-nocturn" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticket Tiers</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70">Tap any field to edit</span>
                </div>
                <div className="space-y-2">
                  {tiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <EditableTierRow
                          tier={tier}
                          onSave={(updatedTier) => {
                            const updated = [...tiers];
                            updated[i] = updatedTier;
                            setTiers(updated);
                          }}
                        />
                      </div>
                      {tiers.length > 1 && (
                        <button
                          aria-label={`Remove tier ${i + 1}`}
                          onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                          className="p-2 text-muted-foreground/40 hover:text-red-400 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {tiers.length < 10 && (
                  <button
                    onClick={() => {
                      const capacity = typeof formData.venueCapacity === "number" ? formData.venueCapacity : 100;
                      const remaining = capacity - tiers.reduce((s, t) => s + t.capacity, 0);
                      setTiers([
                        ...tiers,
                        { name: `Tier ${tiers.length + 1}`, price: 0, capacity: Math.max(remaining, 10) },
                      ]);
                    }}
                    className="flex items-center gap-1.5 text-sm text-nocturn hover:text-nocturn-light transition-colors py-1 min-h-[44px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add tier
                  </button>
                )}
                {tiers.length >= 10 && (
                  <p className="text-[11px] text-muted-foreground">Maximum 10 tiers</p>
                )}
              </div>

              {/* Quick Price — secondary regeneration tool */}
              <div className="border-t border-white/[0.06] pt-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-nocturn" />
                    Quick regenerate
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. $25 or $20-$50"
                      onBlur={(e) => {
                        if (e.target.value.trim()) {
                          generateTiersFromPrice(e.target.value.trim());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) generateTiersFromPrice(val);
                        }
                      }}
                      className="bg-card border-white/[0.06] rounded-xl min-h-[40px] focus:border-nocturn/50"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">
                    Enter a price or range to regenerate all tiers
                  </p>
                </div>
              </div>
            </div>

            {/* Inline P&L forecast */}
            {tiers.length > 0 && tiers.some(t => t.price > 0) && (
              <InlinePnL tiers={tiers} totalExpenses={totalExpenses} />
            )}

            {/* Pricing insight */}
            {!formData.isFree && tiers.length > 0 && tiers.some(t => t.price > 0) && formData.venueCity && formData.date && (
              <PricingInsight
                city={formData.venueCity}
                date={formData.date}
                venueCapacity={typeof formData.venueCapacity === "number" ? formData.venueCapacity : undefined}
                tiers={tiers}
              />
            )}
          </div>
        )}

        {/* ── STEP 4: Budget (Optional) ── */}
        {step === "budget" && (
          <BudgetStep
            draft={budgetDraft}
            setDraft={setBudgetDraft}
            result={budgetResult}
            calculating={calculatingBudget}
            venueCity={formData.venueCity}
            eventDate={formData.date}
            venueCapacity={typeof formData.venueCapacity === "number" ? formData.venueCapacity : undefined}
            onSkip={goNext}
            onCalculate={handleCalculateBudget}
            onSuggestTravel={handleSuggestTravel}
            tiers={tiers}
            onApplySuggestedTiers={() => {
              if (!budgetResult) return;
              const firstPrice = tiers[0]?.price;
              const scaled = scaleBudgetTiers(budgetResult.suggestedTiers, firstPrice);
              setTiers(scaled);
            }}
          />
        )}

        {/* ── STEP 5: Review & Forecast ── */}
        {step === "review" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Review & Create
              </h2>
              <p className="text-sm text-muted-foreground">Everything look good?</p>
            </div>

            {/* Review card */}
            <div className="rounded-2xl border border-nocturn/20 bg-zinc-900 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">
                  Ready to create
                </span>
              </div>

              <EditableTitle
                value={formData.title || "Untitled Event"}
                onSave={(v) => updateForm({ title: v })}
              />

              {formData.description && (
                <EditableDescription
                  value={formData.description}
                  onSave={(v) => updateForm({ description: v })}
                />
              )}

              <div className="grid gap-2">
                <EditableRow
                  label="When"
                  value={`${formatDate(formData.date)}${formData.startTime ? ` at ${formatTime(formData.startTime)}` : ""}`}
                  icon={Calendar}
                  onSave={() => goTo("details")}
                />

                {formData.doorsOpen && (
                  <EditableRow
                    label="Doors"
                    value={formatTime(formData.doorsOpen)}
                    icon={Clock}
                    onSave={() => goTo("details")}
                  />
                )}

                <EditableRow
                  label="Where"
                  value={[formData.venueName, formData.venueCity].filter(Boolean).join(", ")}
                  icon={MapPin}
                  onSave={() => goTo("venue")}
                />

                {typeof formData.venueCapacity === "number" && formData.venueCapacity > 0 && (
                  <EditableRow
                    label="Capacity"
                    value={`${formData.venueCapacity}`}
                    icon={Users}
                    onSave={() => goTo("venue")}
                  />
                )}
              </div>

              {/* Tiers */}
              {tiers.length > 0 && (
                <div className="border-t border-white/5 pt-3 mt-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Ticket className="h-3.5 w-3.5 text-nocturn" />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {formData.isFree ? "Tickets" : "Ticket Tiers"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {tiers.map((tier, i) => (
                      <EditableTierRow
                        key={i}
                        tier={tier}
                        onSave={(updatedTier) => {
                          const updatedTiers = [...tiers];
                          updatedTiers[i] = updatedTier;
                          setTiers(updatedTiers);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Budget summary if calculated */}
              {totalExpenses > 0 && (
                <div className="border-t border-white/5 pt-3 mt-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="h-3.5 w-3.5 text-nocturn" />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Expenses</span>
                  </div>
                  <p className="text-sm font-bold text-white">${totalExpenses.toLocaleString()}</p>
                </div>
              )}
            </div>

            {/* Pricing insight */}
            {!formData.isFree && tiers.length > 0 && tiers.some(t => t.price > 0) && formData.venueCity && formData.date && (
              <PricingInsight
                city={formData.venueCity}
                date={formData.date}
                venueCapacity={typeof formData.venueCapacity === "number" ? formData.venueCapacity : undefined}
                tiers={tiers}
              />
            )}

            {/* Live forecast */}
            {tiers.length > 0 && tiers.some(t => t.price > 0) && (
              <LiveForecast
                tiers={tiers}
                totalExpenses={totalExpenses}
                onTiersUpdate={setTiers}
              />
            )}

            {/* Error — placed above create button for visibility */}
            {error && (
              <div id="wizard-error" role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 text-center">
                {error}
              </div>
            )}

            {/* Warning: no tiers and not free */}
            {!formData.isFree && tiers.length === 0 && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-400 text-center">
                No ticket tiers added. Go back to the Tickets step to add pricing, or mark this as a free event.
              </div>
            )}

            {/* Create button */}
            <p className="text-[11px] text-muted-foreground text-center">Creates a draft — you can edit everything afterwards.</p>
            <Button
              onClick={() => handleCreate()}
              disabled={isSubmitting}
              className="w-full bg-nocturn hover:bg-[#6B1FE7] text-white rounded-xl min-h-[48px] text-base font-semibold transition-all duration-200 active:scale-[0.98] shadow-lg shadow-[#7B2FF7]/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 mr-2" />
              )}
              {isSubmitting ? "Creating..." : "Create Event"}
            </Button>
          </div>
        )}
      </div>

      {/* Bottom nav bar — Back / Next — positioned above mobile tab bar */}
      {step !== "review" && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-background/95 backdrop-blur-sm z-40 mb-[60px] md:mb-0"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        >
          <div className="mx-auto max-w-lg flex flex-col gap-2 px-4 py-3">
            <div className="flex gap-3">
              {currentIdx > 0 ? (
                <Button
                  variant="ghost"
                  onClick={goBack}
                  className="flex-1 min-h-[44px] text-zinc-400 hover:text-white hover:bg-accent rounded-xl transition-all duration-200 active:scale-[0.98]"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>
              ) : (
                <div className="flex-1" />
              )}
              <Button
                onClick={goNext}
                disabled={!canAdvance()}
                className="flex-1 bg-nocturn hover:bg-[#6B1FE7] text-white min-h-[44px] rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {currentIdx === activeSteps.length - 2 ? "Review" : "Next"}
              </Button>
            </div>
            {/* Quick jump back to review if user has been there */}
            {visitedReview && (
              <button
                onClick={() => goTo("review")}
                className="text-xs text-nocturn hover:text-nocturn-light transition-colors text-center py-1"
              >
                Return to Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
