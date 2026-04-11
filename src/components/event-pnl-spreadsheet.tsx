"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Check,
  X,
  Pencil,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import type { EventFinancials } from "@/app/actions/event-financials";
import {
  addExpense,
  updateExpense,
  deleteExpense,
} from "@/app/actions/event-financials";

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

const EXPENSE_CATEGORIES = [
  "venue",
  "marketing",
  "equipment",
  "staffing",
  "production",
  "insurance",
  "permits",
  "transportation",
  "hospitality",
  "other",
] as const;

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// ── Editable Cell ────────────────────────────────────────────────────

function EditableAmountCell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (newValue: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed < 0) {
      setDraft(value.toString());
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(Math.round(parsed * 100) / 100);
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value.toString());
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-sm">$</span>
        <Input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="h-7 w-24 text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
          disabled={saving}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Save amount"
          className="h-6 w-6 text-green-400 hover:text-green-300 hover:bg-green-400/10"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cancel edit"
          className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={handleCancel}
          disabled={saving}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        if (!disabled) {
          setDraft(value.toString());
          setEditing(true);
        }
      }}
      className={`group flex items-center gap-1 text-sm font-mono tabular-nums ${
        disabled
          ? "cursor-default"
          : "cursor-pointer hover:text-nocturn transition-colors"
      }`}
      disabled={disabled}
    >
      {formatCurrency(value)}
      {!disabled && (
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  );
}

// ── Editable Text Cell ───────────────────────────────────────────────

function EditableTextCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (newValue: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (!draft.trim()) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="h-7 w-full text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
          disabled={saving}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Save text"
          className="h-6 w-6 shrink-0 text-green-400 hover:text-green-300 hover:bg-green-400/10"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group flex items-center gap-1 text-sm text-left hover:text-nocturn transition-colors cursor-pointer"
    >
      <span className="truncate">{value || "—"}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  );
}

// ── Add Expense Row ──────────────────────────────────────────────────

function AddExpenseRow({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [amount, setAmount] = useState("");
  const [isPending, startTransition] = useTransition();
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && descRef.current) {
      descRef.current.focus();
    }
  }, [open]);

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) return;

    startTransition(async () => {
      const result = await addExpense(eventId, {
        description: description.trim(),
        category,
        amount: Math.round(parsed * 100) / 100,
      });
      if (!result.error) {
        setDescription("");
        setCategory("other");
        setAmount("");
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={4} className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-nocturn hover:bg-nocturn/5 transition-all"
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Expense
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/50 bg-nocturn/5">
      <td className="px-4 py-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-7 rounded-md bg-background border border-border text-xs px-2 text-foreground focus:ring-1 focus:ring-nocturn/30"
        >
          {EXPENSE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {categoryLabel(cat)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <Input
          ref={descRef}
          placeholder="e.g. Sound system rental"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-7 text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
          disabled={isPending}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-sm">$</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-7 w-24 text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
            disabled={isPending}
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save expense"
            className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel add expense"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  financials: EventFinancials;
}

export function EventPnlSpreadsheet({ financials }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-clear errors
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleUpdateExpense = async (expenseId: string, field: string, value: string | number) => {
    startTransition(async () => {
      const result = await updateExpense(expenseId, { [field]: value });
      if (result.error) setError(result.error);
    });
  };

  const handleDeleteExpense = (expenseId: string) => {
    startTransition(async () => {
      const result = await deleteExpense(expenseId);
      if (result.error) setError(result.error);
    });
  };
  const isProfitable = financials.profitLoss >= 0;

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">&times;</button>
        </div>
      )}
      {/* Summary Cards */}
      {/*
        Three cards, not four. Dropped the old "Net Revenue / After Stripe
        fees" card because it confused organizers — Stripe is buyer-paid,
        so net == gross from their perspective. Showing both was just
        duplicate numbers.
      */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Gross Revenue"
          value={financials.grossRevenue}
          subtitle={`${financials.totalTicketsSold} tickets sold`}
          positive
        />
        <SummaryCard
          label="Total Costs"
          value={financials.totalExpenses + financials.totalArtistFees}
          subtitle="Your out-of-pocket"
        />
        <SummaryCard
          label="Profit / Loss"
          value={financials.profitLoss}
          subtitle={isProfitable ? "In the green" : "In the red"}
          positive={isProfitable}
          highlighted
        />
      </div>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {/* Revenue */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-green-500/5 flex items-center gap-2 border-b border-border">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-green-400">Revenue</span>
          </div>
          <div className="divide-y divide-border/50">
            {financials.ticketTiers.map((tier) => (
              <div key={tier.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tier.name}</p>
                  <p className="text-xs text-muted-foreground">{tier.ticketsSold} / {tier.capacity} sold @ {formatCurrency(tier.price)}</p>
                </div>
                <span className="text-sm font-mono tabular-nums text-green-400 shrink-0 ml-3">{formatCurrency(tier.revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-red-500/5 flex items-center gap-2 border-b border-border">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">Expenses</span>
          </div>
          <div className="divide-y divide-border/50">
            {financials.expenses.map((exp) => (
              <div key={exp.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0"><p className="text-sm truncate">{exp.description || "Expense"}</p><p className="text-xs text-muted-foreground">{exp.category}</p></div>
                <span className="text-sm font-mono tabular-nums text-red-400 shrink-0 ml-3">-{formatCurrency(exp.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border/50">
            <div className={`px-4 py-4 flex items-center justify-between ${isProfitable ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <span className="text-sm font-bold uppercase tracking-wide">{isProfitable ? "Profit" : "Loss"}</span>
              <span className={`text-lg font-black font-mono tabular-nums ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                {isProfitable ? "" : "-"}{formatCurrency(Math.abs(financials.profitLoss))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Spreadsheet Table */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Header */}
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[160px]">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[160px]">
                  Amount
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[80px]">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ── REVENUE SECTION ────────────────────────────── */}
              <tr className="border-b border-border bg-green-500/5">
                <td colSpan={4} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-green-400">
                      Revenue
                    </span>
                  </div>
                </td>
              </tr>

              {/* Ticket Tiers */}
              {financials.ticketTiers.map((tier) => (
                <tr
                  key={tier.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    Tickets
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-sm">{tier.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tier.ticketsSold} / {tier.capacity} sold @ {formatCurrency(tier.price)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-green-400">
                      {formatCurrency(tier.revenue)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" />
                </tr>
              ))}

              {financials.ticketTiers.length === 0 && (
                <tr className="border-b border-border/50">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    Tickets
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-sm italic">
                    No ticket tiers configured
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono text-muted-foreground">
                    $0.00
                  </td>
                  <td />
                </tr>
              )}

              {/* Estimated Bar Revenue */}
              {financials.estimatedBarRevenue != null && financials.estimatedBarRevenue > 0 && (
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">Bar</td>
                  <td className="px-4 py-2.5 text-sm">
                    Estimated Bar Revenue
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-green-400/70">
                      {formatCurrency(financials.estimatedBarRevenue)}
                    </span>
                  </td>
                  <td />
                </tr>
              )}

              {/* Revenue Subtotal */}
              <tr className="border-b border-border bg-green-500/5">
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-green-400 uppercase">
                  Gross Revenue
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-sm font-bold font-mono tabular-nums text-green-400">
                    {formatCurrency(financials.grossRevenue)}
                  </span>
                </td>
                <td />
              </tr>

              {/* ── EXPENSES SECTION ───────────────────────────── */}
              <tr className="border-b border-border bg-red-500/5">
                <td colSpan={4} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                      Expenses
                    </span>
                  </div>
                </td>
              </tr>

              {/* Venue Cost */}
              {financials.venueCost != null && financials.venueCost > 0 && (
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    Venue
                  </td>
                  <td className="px-4 py-2.5 text-sm">Venue Cost</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-red-400">
                      ({formatCurrency(financials.venueCost)})
                    </span>
                  </td>
                  <td />
                </tr>
              )}

              {/* Venue Deposit */}
              {financials.venueDeposit != null && financials.venueDeposit > 0 && (
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    Venue
                  </td>
                  <td className="px-4 py-2.5 text-sm">Venue Deposit</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-red-400/70">
                      ({formatCurrency(financials.venueDeposit)})
                    </span>
                  </td>
                  <td />
                </tr>
              )}

              {/* Custom Expenses (Editable) */}
              {financials.expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors group"
                >
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {categoryLabel(expense.category)}
                  </td>
                  <td className="px-4 py-2.5">
                    <EditableTextCell
                      value={expense.description}
                      onSave={async (v) => {
                        await handleUpdateExpense(expense.id, "description", v);
                      }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end">
                      <span className="text-red-400 mr-1">(</span>
                      <EditableAmountCell
                        value={expense.amount}
                        onSave={async (v) => {
                          await handleUpdateExpense(expense.id, "amount", v);
                        }}
                      />
                      <span className="text-red-400 ml-0.5">)</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete expense"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all"
                      onClick={() => handleDeleteExpense(expense.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}

              {/* Add Expense Row */}
              <AddExpenseRow eventId={financials.eventId} />

              {/* Expenses Subtotal */}
              <tr className="border-b border-border bg-red-500/5">
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-400 uppercase">
                  Total Expenses
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-sm font-bold font-mono tabular-nums text-red-400">
                    ({formatCurrency(financials.totalExpenses + (financials.venueCost ?? 0))})
                  </span>
                </td>
                <td />
              </tr>

              {/* ── ARTIST FEES SECTION ────────────────────────── */}
              {financials.artistFees.length > 0 && (
                <>
                  <tr className="border-b border-border bg-amber-500/5">
                    <td colSpan={4} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                          Artist Fees
                        </span>
                      </div>
                    </td>
                  </tr>

                  {financials.artistFees.map((artist) => (
                    <tr
                      key={artist.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        Artist
                      </td>
                      <td className="px-4 py-2.5 text-sm">{artist.artistName}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-mono tabular-nums text-amber-400">
                          ({formatCurrency(artist.fee)})
                        </span>
                      </td>
                      <td />
                    </tr>
                  ))}

                  <tr className="border-b border-border bg-amber-500/5">
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-amber-400 uppercase">
                      Total Artist Fees
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-bold font-mono tabular-nums text-amber-400">
                        ({formatCurrency(financials.totalArtistFees)})
                      </span>
                    </td>
                    <td />
                  </tr>
                </>
              )}

              {/*
                Processing fees section removed. Stripe + Nocturn fees are
                buyer-paid (Nocturn is the merchant of record), so they
                never come out of the organizer's pocket. Showing them as
                line items here made promoters think they were being
                charged twice.
              */}

              {/* ── TOTALS ─────────────────────────────────────── */}
              <tr className={`${isProfitable ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <td className="px-4 py-4" />
                <td className="px-4 py-4 text-right text-sm font-bold uppercase tracking-wide">
                  {isProfitable ? "Profit" : "Loss"}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`text-lg font-black font-mono tabular-nums ${
                    isProfitable ? "text-green-400" : "text-red-400"
                  }`}>
                    {isProfitable ? "" : "-"}{formatCurrency(Math.abs(financials.profitLoss))}
                  </span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar Minimum Indicator */}
      {financials.barMinimum != null && financials.barMinimum > 0 && (
        <div className="rounded-xl border border-border p-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bar Minimum</p>
              <p className="text-xs text-muted-foreground">
                Required minimum bar spend for the venue
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold font-mono tabular-nums">
                {formatCurrency(financials.barMinimum)}
              </p>
              {financials.estimatedBarRevenue != null && (
                <p className={`text-xs ${
                  financials.estimatedBarRevenue >= financials.barMinimum
                    ? "text-green-400"
                    : "text-amber-400"
                }`}>
                  {financials.estimatedBarRevenue >= financials.barMinimum
                    ? "On track to meet"
                    : `${formatCurrency(financials.barMinimum - financials.estimatedBarRevenue)} short`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ─────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  subtitle,
  positive,
  highlighted,
}: {
  label: string;
  value: number;
  subtitle?: string;
  positive?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${
      highlighted
        ? positive
          ? "border-green-500/30 bg-green-500/5"
          : "border-red-500/30 bg-red-500/5"
        : "border-border bg-card"
    }`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold font-mono tabular-nums ${
        highlighted
          ? positive
            ? "text-green-400"
            : "text-red-400"
          : "text-foreground"
      }`}>
        {formatCurrency(value)}
      </p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
