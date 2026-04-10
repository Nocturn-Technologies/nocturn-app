"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import { type TicketTier } from "@/app/actions/ai-parse-event";
import { getTicketPricingSuggestion, type PricingSuggestion } from "@/app/actions/pricing-suggestion";
import { calculateBudget, type BudgetResult, type BudgetInput } from "@/app/actions/budget-planner";
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
} from "lucide-react";
import Link from "next/link";
import { haptic } from "@/lib/haptics";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Draft Persistence ─────────────────────────────────────────────────────

const DRAFT_STORAGE_KEY = "nocturn-event-draft";
const DRAFT_VERSION = 3;

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
  budgetInput: Partial<BudgetInput>;
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

const ALL_STEPS: WizardStep[] = ["details", "venue", "tickets", "budget", "review"];
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
                    ? "bg-[#7B2FF7] text-white scale-110 shadow-lg shadow-[#7B2FF7]/30"
                    : isDone
                    ? "bg-[#7B2FF7]/20 text-[#7B2FF7]"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium transition-colors ${
                isActive ? "text-white" : isDone ? "text-[#7B2FF7]" : "text-zinc-600"
              }`}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${
                i < currentIdx ? "bg-[#7B2FF7]/40" : "bg-zinc-800"
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
        className="w-full text-lg font-bold text-white bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-[#7B2FF7]/50"
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
      <Icon className="h-3.5 w-3.5 text-[#7B2FF7] shrink-0" />
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
            className="flex-1 min-w-0 bg-zinc-800 border border-white/10 rounded-md px-2 py-1 text-sm text-white outline-none focus:border-[#7B2FF7]/50"
          />
        </div>
      ) : (
        <button
          onClick={() => { setEditValue(value); setEditing(true); }}
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
        onClick={() => { setEditValue(value); setEditing(true); }}
        className="text-sm text-zinc-400 line-clamp-3 text-left flex items-start gap-1.5 hover:text-zinc-300 active:scale-[0.98] transition-all duration-200"
      >
        <span className="flex-1">{value}</span>
        <Pencil className="h-3 w-3 text-zinc-500 opacity-0 group-hover/desc:opacity-100 transition-opacity shrink-0 mt-0.5" />
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
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
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
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
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
      <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-[#7B2FF7] animate-pulse" />
          <span className="text-xs text-zinc-500">Checking market prices...</span>
        </div>
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

      <div className="grid grid-cols-2 gap-1.5">
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
        <p className="text-[11px] text-zinc-400">
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

      <p className="text-[10px] text-zinc-600 italic">{pricing.suggestion}</p>
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

  const STRIPE_FEE_RATE = 0.029;
  const STRIPE_FEE_FLAT = 0.30;

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

  function calcNet(rate: number) {
    const ticketsSold = Math.round(totalCapacity * rate);
    const gross = tiers.reduce((s, t) => s + t.price * Math.round(t.capacity * rate), 0);
    const stripeProcessing = ticketsSold * STRIPE_FEE_FLAT + gross * STRIPE_FEE_RATE;
    const netRevenue = gross - stripeProcessing;
    const profit = netRevenue - totalExpenses;
    return { ticketsSold, gross, net: netRevenue, profit };
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

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 space-y-3">
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
        <p className={`text-3xl font-bold ${totalExpenses > 0 ? (projections[2].profit >= 0 ? "text-green-400" : "text-red-400") : "text-white"}`}>
          {totalExpenses > 0
            ? `${projections[2].profit >= 0 ? "" : "-"}$${Math.abs(projections[2].profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `$${projections[2].net.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {totalExpenses > 0 ? "estimated profit at sell-out" : "max net revenue at sell-out"}
        </p>
        {totalExpenses > 0 && (
          <p className="text-[10px] text-zinc-600 mt-0.5">
            ${projections[2].net.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue − ${totalExpenses.toLocaleString()} expenses
          </p>
        )}
      </div>

      {/* Price slider */}
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
          onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-zinc-800 accent-[#7B2FF7] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>${Math.round(baseTier0Price * 0.5)}</span>
          <span>${baseTier0Price} (base)</span>
          <span>${Math.round(baseTier0Price * 2)}</span>
        </div>
      </div>

      {priceMultiplier !== 1.0 && (
        <div className="flex flex-wrap gap-1.5">
          {tiers.map((t, i) => (
            <span key={i} className="text-[11px] bg-zinc-800/80 text-zinc-400 rounded-full px-2 py-0.5">
              {t.name}: <span className="text-white font-medium">${t.price}</span>
              <span className="text-zinc-600 line-through ml-1">${baseTiersRef.current[i]?.price ?? t.price}</span>
            </span>
          ))}
        </div>
      )}

      {/* Scenario comparison */}
      <div className="space-y-1.5">
        {projections.map((p) => {
          const displayValue = totalExpenses > 0 ? p.profit : p.net;
          const isLoss = displayValue < 0;
          return (
            <div
              key={p.label}
              className="flex items-center gap-3 rounded-xl bg-zinc-800/30 px-3 py-2 transition-colors duration-200 hover:bg-zinc-800/50"
            >
              <span className="text-sm">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-zinc-500">{p.label}</span>
                  <span className={`text-xs font-bold ${totalExpenses > 0 ? (isLoss ? "text-red-400" : "text-green-400") : "text-white"}`}>
                    {isLoss ? "-" : ""}${Math.abs(displayValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    {totalExpenses > 0 && <span className="text-[9px] text-zinc-600 ml-1">{isLoss ? "loss" : "profit"}</span>}
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
            </div>
          );
        })}
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
          {(() => {
            const at75 = totalExpenses > 0 ? projections[1].profit : projections[1].net;
            return (
              <>
                <p className={`text-xs font-bold ${totalExpenses > 0 ? (at75 >= 0 ? "text-green-400" : "text-red-400") : "text-green-400"}`}>
                  {at75 < 0 ? "-" : ""}${Math.abs(at75).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[9px] text-zinc-500">@ 75%</p>
              </>
            );
          })()}
        </div>
      </div>

      <p className="text-[9px] text-zinc-600 text-center">
        {totalExpenses > 0
          ? `Profit = revenue \u2212 $${totalExpenses.toLocaleString()} expenses \u2212 Stripe fees (2.9% + $0.30)`
          : "Net after Stripe fees (2.9% + $0.30) \u2022 You keep 100% of ticket price"}
      </p>
    </div>
  );
}

// ─── Playbook Selector ─────────────────────────────────────────────────────

const PLAYBOOK_ICONS: Record<string, React.ReactNode> = {
  rocket: <Rocket className="h-5 w-5" />,
  zap: <Zap className="h-5 w-5" />,
  megaphone: <Megaphone className="h-5 w-5" />,
};

function PlaybookSelector({
  eventTitle,
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
    { id: "launch-promote", name: "Launch & Promote", description: "25 tasks covering promo plan, logistics, and post-event wrap", taskCount: 25, icon: "rocket", recommended: true },
    { id: "lean-launch", name: "Lean Launch", description: "10 essential tasks for small or free events", taskCount: 10, icon: "zap", recommended: false },
    { id: "full-campaign", name: "Full Campaign", description: "33 tasks including press, paid ads, video, and influencer outreach", taskCount: 33, icon: "megaphone", recommended: false },
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
                  <span className="px-1.5 py-0.5 rounded-full bg-nocturn/20 text-nocturn text-[10px] font-semibold">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{opt.description}</p>
              <p className="text-[10px] text-zinc-500 mt-1">{opt.taskCount} tasks with auto-assigned due dates</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onSkip}
        disabled={applying}
        className="flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
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
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors py-1"
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
        <Icon className="h-3.5 w-3.5 text-[#7B2FF7]" />
        {label}
        {required && <span className="text-[#7B2FF7] text-xs">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("details");
  const [formData, setFormData] = useState<EventFormData>(DEFAULT_FORM);
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [budgetInput, setBudgetInput] = useState<Partial<BudgetInput>>({});
  const [budgetResult, setBudgetResult] = useState<BudgetResult | null>(null);
  const [phase, setPhase] = useState<"wizard" | "creating" | "playbook" | "done">("wizard");
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [applyingPlaybook, setApplyingPlaybook] = useState(false);
  const [venueMode, setVenueMode] = useState<"picker" | "manual">("picker");
  const [calculatingBudget, setCalculatingBudget] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflight, setPreflight] = useState<"loading" | "ok" | "no-auth" | "no-collective">("loading");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [visitedReview, setVisitedReview] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);
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

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setStep(draft.step);
      setFormData(draft.formData);
      setTiers(draft.tiers);
      setBudgetInput(draft.budgetInput);
      setBudgetResult(draft.budgetResult);
      setPhase(draft.phase === "creating" || draft.phase === "playbook" ? "wizard" : draft.phase);
    }
    setDraftLoaded(true);
  }, []);

  // Save draft on changes
  const saveDraftDebounced = useCallback(() => {
    const timer = setTimeout(() => {
      if (phase === "done" || phase === "playbook") return;
      saveDraft({ version: DRAFT_VERSION, step, formData, tiers, budgetInput, budgetResult, phase });
    }, 500);
    return timer;
  }, [step, formData, tiers, budgetInput, budgetResult, phase]);

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

  // Total expenses from budget input (bar minimum is a threshold, not a direct expense — matches server logic)
  const totalExpenses =
    (budgetInput.talentFee || 0) +
    (budgetInput.venueCost || 0) +
    (budgetInput.deposit || 0) +
    (budgetInput.otherExpenses || 0);

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

  // Calculate budget
  async function handleCalculateBudget() {
    setCalculatingBudget(true);
    setError(null);
    try {
      const input: BudgetInput = {
        headlinerType: budgetInput.headlinerType || "none",
        headlinerOrigin: budgetInput.headlinerOrigin,
        talentFee: budgetInput.talentFee,
        venueCost: budgetInput.venueCost,
        barMinimum: budgetInput.barMinimum,
        deposit: budgetInput.deposit,
        otherExpenses: budgetInput.otherExpenses,
        venueCity: formData.venueCity,
        venueCapacity: typeof formData.venueCapacity === "number" ? formData.venueCapacity : undefined,
        date: formData.date,
        stayNights: budgetInput.stayNights,
      };
      const result = await calculateBudget(input);
      setBudgetResult(result);

      // Auto-update tiers if budget suggests them and user has no tiers yet
      if (result.suggestedTiers.length > 0 && tiers.length === 0) {
        const firstTierPrice = tiers.length > 0 ? tiers[0].price : undefined;
        const scaled = scaleBudgetTiers(result.suggestedTiers, firstTierPrice);
        setTiers(scaled);
      }
    } catch {
      setError("Could not calculate budget — try again or skip this step.");
    } finally {
      setCalculatingBudget(false);
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
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse">
          <Check className="h-8 w-8 text-green-500" />
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
      <div className="mx-auto max-w-lg flex flex-col items-center gap-4 py-24 animate-fade-in">
        <Loader2 className="h-10 w-10 animate-spin text-[#7B2FF7]" />
        <p className="text-sm text-zinc-400">Loading...</p>
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
        <Loader2 className="h-10 w-10 animate-spin text-[#7B2FF7]" />
        <p className="text-sm text-zinc-400">Creating your event...</p>
        <p className="text-[10px] text-zinc-600">This may take a moment while we enrich your event page with AI</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100dvh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 shrink-0 px-1">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold font-heading truncate">New Event</h1>
        {(formData.title || formData.venueName) && (
          <button
            onClick={() => {
              if (!window.confirm("Start over? You'll lose your progress.")) return;
              clearDraft();
              setFormData(DEFAULT_FORM);
              setTiers([]);
              setBudgetInput({});
              setBudgetResult(null);
              setStep("details");
              setError(null);
              setVenueMode("picker");
            }}
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Start over
          </button>
        )}
      </div>

      {/* Progress */}
      <StepProgress current={step} steps={activeSteps} />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-1 pb-32 min-h-0">
        {/* ── STEP 1: Event Details ── */}
        {step === "details" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Event Details
              </h2>
              <p className="text-sm text-zinc-500">What&apos;s the event?</p>
            </div>

            {/* Mode selector — free RSVP vs ticketed. This is the single most
                important decision in the wizard, so it lives at the top. */}
            <div className="rounded-2xl border border-white/[0.06] bg-card p-4">
              <p className="text-[11px] font-semibold tracking-wider uppercase text-zinc-500 mb-3">Event type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updateForm({ isFree: true });
                    setTiers([]);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all active:scale-[0.98] min-h-[72px] ${
                    formData.isFree
                      ? "border-[#7B2FF7] bg-[#7B2FF7]/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-[#7B2FF7]" />
                    <span className="text-sm font-semibold text-white">Free · RSVP</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug">Collect Yes/Maybe/No RSVPs. No tickets, no fees.</p>
                </button>
                <button
                  type="button"
                  onClick={() => updateForm({ isFree: false })}
                  className={`rounded-xl border p-3 text-left transition-all active:scale-[0.98] min-h-[72px] ${
                    !formData.isFree
                      ? "border-[#7B2FF7] bg-[#7B2FF7]/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Ticket className="h-4 w-4 text-[#7B2FF7]" />
                    <span className="text-sm font-semibold text-white">Ticketed</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug">Sell tickets with Stripe. Multiple price tiers.</p>
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
                  className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                  autoFocus
                />
                {formData.title.length > 150 && (
                  <p className={`text-[10px] text-right ${formData.title.length > 190 ? "text-yellow-400" : "text-zinc-600"}`}>
                    {formData.title.length}/200
                  </p>
                )}
              </FormField>

              <FormField label="Date" icon={Calendar} required>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => updateForm({ date: e.target.value })}
                  className={`bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50 ${dateInPast ? "border-red-500/50" : ""}`}
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
                  className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                />
                {formData.startTime === "22:00" && (
                  <p className="text-[10px] text-zinc-500 mt-0.5">Default: 10 PM — adjust if needed</p>
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
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                  </FormField>

                  <FormField label="End Time" icon={Clock}>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => { updateForm({ endTime: e.target.value }); setShowOptionalDetails(true); }}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                    {formData.endTime && formData.startTime && formData.endTime < formData.startTime && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">Ends after midnight (next day)</p>
                    )}
                  </FormField>

                  <FormField label="Description" icon={Info}>
                    <textarea
                      placeholder="Tell people what to expect..."
                      value={formData.description}
                      onChange={(e) => { updateForm({ description: e.target.value }); setShowOptionalDetails(true); }}
                      maxLength={5000}
                      rows={3}
                      className="flex w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#7B2FF7]/50 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[44px] transition-colors"
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
              <p className="text-sm text-zinc-500">Where&apos;s it happening?</p>
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
                    className="text-xs text-[#7B2FF7] hover:text-[#9D5CFF] transition-colors"
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
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    autoFocus={!formData.venueName}
                  />
                </FormField>

                <FormField label="Address" icon={MapPin}>
                  <Input
                    placeholder="794 Bathurst St"
                    value={formData.venueAddress}
                    onChange={(e) => updateForm({ venueAddress: e.target.value })}
                    maxLength={500}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                  />
                </FormField>

                <FormField label="City" icon={MapPin} required>
                  <Input
                    placeholder="Toronto"
                    value={formData.venueCity}
                    onChange={(e) => updateForm({ venueCity: e.target.value })}
                    maxLength={100}
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
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
                    className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
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
              <p className="text-sm text-zinc-500">How much are tickets?</p>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-5">
              {/* Mode was chosen on step 1 — this step is skipped for free events.
                  Keeping a one-line reminder with a shortcut back to details for rare cases. */}
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Paid event · ticketed</span>
                <button
                  type="button"
                  onClick={() => goTo("details")}
                  className="text-[#7B2FF7] hover:text-[#9D5CFF] transition-colors"
                >
                  Change to free
                </button>
              </div>

              {(
                <div className="space-y-4">
                  {/* Quick price input */}
                  <FormField label="Quick Price" icon={Ticket}>
                    <div className="space-y-1">
                      <Input
                        placeholder="$25 or $20-$50 for a range"
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
                        className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                      />
                      <p className="text-[10px] text-zinc-600">
                        {tiers.length > 0 ? "Re-enter a price to regenerate tiers" : "Enter a price to auto-generate tiers, or add them manually below"}
                      </p>
                    </div>
                  </FormField>

                  {/* Tier editor */}
                  {tiers.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Ticket className="h-3.5 w-3.5 text-[#7B2FF7]" />
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ticket Tiers</span>
                      </div>
                      {tiers.map((tier, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <Input
                              aria-label={`Tier ${i + 1} name`}
                              placeholder="Tier name"
                              value={tier.name}
                              onChange={(e) => {
                                const updated = [...tiers];
                                updated[i] = { ...tier, name: e.target.value };
                                setTiers(updated);
                              }}
                              className="bg-zinc-900 border-white/10 rounded-lg text-sm min-h-[40px] focus:border-[#7B2FF7]/50"
                            />
                            <Input
                              aria-label={`Tier ${i + 1} price`}
                              type="number"
                              placeholder="Price"
                              value={tier.price}
                              onChange={(e) => {
                                const updated = [...tiers];
                                const parsed = parseFloat(e.target.value);
                                updated[i] = { ...tier, price: Number.isFinite(parsed) ? parsed : tier.price };
                                setTiers(updated);
                              }}
                              min={0}
                              className="bg-zinc-900 border-white/10 rounded-lg text-sm min-h-[40px] focus:border-[#7B2FF7]/50"
                            />
                            <Input
                              aria-label={`Tier ${i + 1} quantity`}
                              type="number"
                              placeholder="Qty"
                              value={tier.capacity}
                              onChange={(e) => {
                                const updated = [...tiers];
                                updated[i] = { ...tier, capacity: parseInt(e.target.value) || 0 };
                                setTiers(updated);
                              }}
                              min={1}
                              className="bg-zinc-900 border-white/10 rounded-lg text-sm min-h-[40px] focus:border-[#7B2FF7]/50"
                            />
                          </div>
                          <button
                            aria-label={`Remove tier ${i + 1}`}
                            onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                            className="p-2 text-zinc-500 hover:text-red-400 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

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
                      className="flex items-center gap-1.5 text-sm text-[#7B2FF7] hover:text-[#9D5CFF] transition-colors py-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add tier
                    </button>
                  )}
                  {tiers.length >= 10 && (
                    <p className="text-[10px] text-zinc-500">Maximum 10 tiers</p>
                  )}
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
          </div>
        )}

        {/* ── STEP 4: Budget (Optional) ── */}
        {step === "budget" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Budget Planning
              </h2>
              <p className="text-sm text-zinc-500">Optional — helps forecast profit</p>
            </div>

            {/* Skip button */}
            <button
              onClick={goNext}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-card p-4 text-sm text-zinc-400 hover:text-zinc-200 hover:border-white/[0.12] transition-all active:scale-[0.98]"
            >
              <SkipForward className="h-4 w-4" />
              Skip — I&apos;ll figure out costs later
            </button>

            <div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-5">
              {/* Headliner type */}
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <Music className="h-3.5 w-3.5 text-[#7B2FF7]" />
                  Headliner
                </span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Headliner type">
                  {([
                    { value: "international" as const, label: "International", icon: Plane },
                    { value: "local" as const, label: "Local", icon: Music },
                    { value: "none" as const, label: "No headliner", icon: Users },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      role="radio"
                      aria-checked={budgetInput.headlinerType === opt.value}
                      onClick={() => setBudgetInput(prev => ({ ...prev, headlinerType: opt.value }))}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all active:scale-[0.98] ${
                        budgetInput.headlinerType === opt.value
                          ? "border-[#7B2FF7]/40 bg-[#7B2FF7]/5 text-white"
                          : "border-white/[0.06] bg-zinc-900 text-zinc-400 hover:border-white/[0.12]"
                      }`}
                    >
                      <opt.icon className="h-4 w-4" />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional headliner fields */}
              {budgetInput.headlinerType === "international" && (
                <div className="space-y-3 animate-fade-in">
                  <FormField label="Flying from" icon={Plane}>
                    <Input
                      placeholder="London, UK"
                      value={budgetInput.headlinerOrigin || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, headlinerOrigin: e.target.value }))}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                  </FormField>
                  <FormField label="Talent Fee" icon={DollarSign}>
                    <Input
                      type="number"
                      placeholder="2000"
                      value={budgetInput.talentFee || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, talentFee: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                  </FormField>
                  <FormField label="Stay (nights)" icon={Clock}>
                    <Input
                      type="number"
                      placeholder="2"
                      value={budgetInput.stayNights || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, stayNights: parseInt(e.target.value) || 0 }))}
                      min={0}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                  </FormField>
                </div>
              )}

              {budgetInput.headlinerType === "local" && (
                <div className="animate-fade-in">
                  <FormField label="Talent Fee" icon={DollarSign}>
                    <Input
                      type="number"
                      placeholder="500"
                      value={budgetInput.talentFee || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, talentFee: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50"
                    />
                  </FormField>
                </div>
              )}

              {/* Venue costs */}
              <div className="space-y-3 border-t border-white/5 pt-4">
                <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <DollarSign className="h-3.5 w-3.5 text-[#7B2FF7]" />
                  Venue Costs
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Room Rental</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={budgetInput.venueCost || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, venueCost: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-[#7B2FF7]/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Bar Minimum</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={budgetInput.barMinimum || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, barMinimum: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-[#7B2FF7]/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Deposit</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={budgetInput.deposit || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, deposit: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-[#7B2FF7]/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Other (sound, lights, etc.)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={budgetInput.otherExpenses || ""}
                      onChange={(e) => setBudgetInput(prev => ({ ...prev, otherExpenses: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-[#7B2FF7]/50"
                    />
                  </div>
                </div>
              </div>

              {/* Calculate button */}
              <Button
                onClick={handleCalculateBudget}
                disabled={calculatingBudget || totalExpenses === 0}
                className="w-full bg-[#7B2FF7] hover:bg-[#6B1FE7] text-white rounded-xl min-h-[44px] transition-all active:scale-[0.98]"
              >
                {calculatingBudget ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TrendingUp className="h-4 w-4 mr-2" />
                )}
                Calculate Budget
              </Button>

              {/* Budget result */}
              {budgetResult && (
                <div className="rounded-xl bg-zinc-800/50 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Budget Summary</span>
                    <span className="text-sm font-bold text-white">${budgetResult.totalExpenses.toLocaleString()}</span>
                  </div>

                  {budgetResult.travelEstimate && (
                    <p className="text-xs text-zinc-400">
                      Travel: ~${budgetResult.travelEstimate.total.toLocaleString()} ({budgetResult.travelEstimate.breakdown})
                    </p>
                  )}

                  <p className="text-xs text-zinc-400">
                    Break-even: <span className="text-white font-medium">{budgetResult.breakEven.ticketsNeeded} tickets</span> at ${budgetResult.breakEven.atPrice}
                  </p>

                  <div className="space-y-1">
                    {budgetResult.scenarios.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">{s.label}</span>
                        <span className={`font-medium ${s.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {s.profit >= 0 ? "+" : ""}${s.profit.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Apply suggested tiers button if user already has tiers */}
                  {budgetResult.suggestedTiers.length > 0 && tiers.length > 0 && (
                    <button
                      onClick={() => {
                        const firstPrice = tiers[0]?.price;
                        const scaled = scaleBudgetTiers(budgetResult.suggestedTiers, firstPrice);
                        setTiers(scaled);
                      }}
                      className="text-xs text-[#7B2FF7] hover:text-[#9D5CFF] transition-colors"
                    >
                      Apply suggested tiers ({budgetResult.suggestedTiers.length} tiers)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 5: Review & Forecast ── */}
        {step === "review" && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h2 className="text-lg font-bold font-heading bg-gradient-to-r from-[#7B2FF7] to-[#9D5CFF] bg-clip-text text-transparent">
                Review & Create
              </h2>
              <p className="text-sm text-zinc-500">Everything look good?</p>
            </div>

            {/* Review card */}
            <div className="rounded-2xl border border-[#7B2FF7]/20 bg-zinc-900 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-green-400" />
                </div>
                <span className="text-xs text-green-400 font-medium uppercase tracking-wider">
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
                    <Ticket className="h-3.5 w-3.5 text-[#7B2FF7]" />
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
                    <DollarSign className="h-3.5 w-3.5 text-[#7B2FF7]" />
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
            <Button
              onClick={() => {
                if (!window.confirm("Create this event as a draft? You can edit everything afterwards.")) return;
                handleCreate();
              }}
              disabled={isSubmitting}
              className="w-full bg-[#7B2FF7] hover:bg-[#6B1FE7] text-white rounded-xl min-h-[48px] text-base font-semibold transition-all active:scale-[0.98] shadow-lg shadow-[#7B2FF7]/20 disabled:opacity-50"
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

      {/* Bottom nav bar — Back / Next */}
      {step !== "review" && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-background/95 backdrop-blur-sm z-10"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        >
          <div className="mx-auto max-w-lg flex flex-col gap-2 px-4 py-3">
            <div className="flex gap-3">
              {currentIdx > 0 ? (
                <Button
                  variant="ghost"
                  onClick={goBack}
                  className="flex-1 min-h-[44px] text-zinc-400 hover:text-white rounded-xl"
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
                className="flex-1 bg-[#7B2FF7] hover:bg-[#6B1FE7] text-white min-h-[44px] rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === "budget" ? "Review" : "Next"}
              </Button>
            </div>
            {/* Quick jump back to review if user has been there */}
            {visitedReview && (
              <button
                onClick={() => goTo("review")}
                className="text-xs text-[#7B2FF7] hover:text-[#9D5CFF] transition-colors text-center py-1"
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
