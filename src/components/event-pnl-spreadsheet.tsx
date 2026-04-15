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
  Download,
  Image as ImageIcon,
} from "lucide-react";
import type { EventFinancials } from "@/app/actions/event-financials";
import {
  addExpense,
  updateExpense,
  deleteExpense,
  addRevenueLine,
  updateRevenueLine,
  deleteRevenueLine,
  updateEventBarSettings,
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
  "talent",
  "venue",
  "production",
  "sound",
  "lighting",
  "staffing",
  "security",
  "marketing",
  "hospitality",
  "transportation",
  "equipment",
  "decor",
  "insurance",
  "permits",
  "booking_fee",
  "other",
] as const;

const REVENUE_CATEGORIES = [
  "bar",
  "sponsorship",
  "merch",
  "coat_check",
  "donation",
  "other",
] as const;

function categoryLabel(cat: string): string {
  // Replace underscores so "coat_check" → "Coat check"
  const spaced = cat.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
          className="h-7 w-24 text-base md:text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
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
          className="h-7 w-full text-base md:text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
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
        <td colSpan={8} className="px-4 py-2">
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
          className="h-7 rounded-md bg-background border border-border text-base md:text-xs px-2 text-foreground focus:ring-1 focus:ring-nocturn/30"
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
          className="h-7 text-base md:text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
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
            className="h-7 w-24 text-base md:text-sm bg-background border-nocturn/50 focus-visible:ring-nocturn/30"
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

// ── Add Revenue Row ──────────────────────────────────────────────────
// Mirror of AddExpenseRow but for the event_revenue table. Categories are
// drawn from REVENUE_CATEGORIES (bar / sponsorship / merch / etc.).

function AddRevenueRow({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("bar");
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
      const result = await addRevenueLine(eventId, {
        description: description.trim(),
        category,
        amount: Math.round(parsed * 100) / 100,
      });
      if (!result.error) {
        setDescription("");
        setCategory("bar");
        setAmount("");
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-green-400 hover:bg-green-400/5 transition-all"
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Revenue Line
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/50 bg-green-500/5">
      <td className="px-4 py-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-7 rounded-md bg-background border border-border text-base md:text-xs px-2 text-foreground focus:ring-1 focus:ring-green-400/30"
        >
          {REVENUE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {categoryLabel(cat)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <Input
          ref={descRef}
          placeholder="e.g. Bar sales, Sponsor fee"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-7 text-base md:text-sm bg-background border-green-400/40 focus-visible:ring-green-400/30"
          disabled={isPending}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1 justify-end">
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
            className="h-7 w-24 text-base md:text-sm bg-background border-green-400/40 focus-visible:ring-green-400/30"
            disabled={isPending}
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save revenue line"
            className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel add revenue line"
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

  const handleUpdateRevenue = async (revenueId: string, field: string, value: string | number) => {
    startTransition(async () => {
      const result = await updateRevenueLine(revenueId, { [field]: value });
      if (result.error) setError(result.error);
    });
  };

  const handleDeleteRevenue = (revenueId: string) => {
    startTransition(async () => {
      const result = await deleteRevenueLine(revenueId);
      if (result.error) setError(result.error);
    });
  };

  const handleUpdateBarSettings = async (
    field: "barMinimum" | "actualBarRevenue",
    value: number
  ) => {
    startTransition(async () => {
      const result = await updateEventBarSettings(financials.eventId, { [field]: value });
      if (result.error) setError(result.error);
    });
  };

  const pnlRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportPnl = async (format: "png" | "pdf") => {
    if (!pnlRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(pnlRef.current, {
        backgroundColor: "#09090B",
        scale: 2,
        useCORS: true,
      });

      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${financials.eventTitle ?? "event"}-pnl.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const { jsPDF } = await import("jspdf");
        const imgData = canvas.toDataURL("image/png");
        const imgW = canvas.width;
        const imgH = canvas.height;
        const pdfW = imgW * 0.264583; // px to mm at 96 dpi
        const pdfH = imgH * 0.264583;
        const pdf = new jsPDF({
          orientation: pdfW > pdfH ? "landscape" : "portrait",
          unit: "mm",
          format: [pdfW, pdfH],
        });
        pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
        pdf.save(`${financials.eventTitle ?? "event"}-pnl.pdf`);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const isProfitable = financials.profitLoss >= 0;

  // ── Forecast scenarios ──────────────────────────────────────────────
  const fRates = [0.5, 0.75, 1.0, 1.25];
  const fLabels = ["50%", "75%", "100%", "125%"];
  const totalFixedCosts =
    (financials.venueCost ?? 0) +
    (financials.venueDeposit ?? 0) +
    financials.totalExpenses +
    financials.totalArtistFees +
    financials.barShortfall;

  const forecasts = fRates.map((rate) => {
    const tierRevs = financials.ticketTiers.map((t) => {
      const sold = Math.min(Math.round(t.capacity * rate), Math.round(t.capacity * 1.25));
      return t.price * sold;
    });
    const ticketRev = tierRevs.reduce((s, r) => s + r, 0);
    const gross = ticketRev + financials.additionalRevenue;
    const profit = gross - totalFixedCosts;
    return { tierRevs, gross, profit };
  });

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">&times;</button>
        </div>
      )}

      {/* Share / Export */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5 border-border/60 hover:border-nocturn/50 hover:text-nocturn"
          onClick={() => exportPnl("png")}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Save as Image
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5 border-border/60 hover:border-nocturn/50 hover:text-nocturn"
          onClick={() => exportPnl("pdf")}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export PDF
        </Button>
      </div>

      {/* ── Exportable P&L area ─────────────────────────────────── */}
      <div ref={pnlRef} className="space-y-4">

      {/* Summary Cards */}
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
          <div className="px-4 py-1.5 bg-green-500/5 flex items-center gap-2 border-b border-border">
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
            {financials.revenueLines.map((line) => (
              <div key={line.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{line.description || "Revenue"}</p>
                  <p className="text-xs text-muted-foreground">{categoryLabel(line.category)}</p>
                </div>
                <span className="text-sm font-mono tabular-nums text-green-400 shrink-0 ml-3">{formatCurrency(line.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-1.5 bg-red-500/5 flex items-center gap-2 border-b border-border">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">Expenses</span>
          </div>
          <div className="divide-y divide-border/50">
            {financials.expenses.map((exp) => (
              <div key={exp.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0"><p className="text-sm truncate">{exp.description || "Expense"}</p><p className="text-xs text-muted-foreground">{categoryLabel(exp.category)}</p></div>
                <span className="text-sm font-mono tabular-nums text-red-400 shrink-0 ml-3">-{formatCurrency(exp.amount)}</span>
              </div>
            ))}
            {financials.barShortfall > 0 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm truncate">Bar Minimum Shortfall</p>
                  <p className="text-xs text-muted-foreground">Owed to venue</p>
                </div>
                <span className="text-sm font-mono tabular-nums text-amber-400 shrink-0 ml-3">-{formatCurrency(financials.barShortfall)}</span>
              </div>
            )}
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">
                  Actual
                </th>
                {fLabels.map((label, i) => (
                  <th
                    key={i}
                    className={`px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[100px] ${
                      i === 2 ? "text-nocturn" : "text-muted-foreground/60"
                    }`}
                  >
                    {label}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">

                </th>
              </tr>
            </thead>

            <tbody>
              {/* ── REVENUE SECTION ────────────────────────────── */}
              <tr className="border-b border-border bg-green-500/5">
                <td colSpan={8} className="px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-green-400">
                      Revenue
                    </span>
                  </div>
                </td>
              </tr>

              {/* Ticket Tiers */}
              {financials.ticketTiers.map((tier, ti) => (
                <tr
                  key={tier.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    Tickets
                  </td>
                  <td className="px-4 py-1.5">
                    <div className="flex flex-col">
                      <span className="text-sm">{tier.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tier.ticketsSold} / {tier.capacity} sold @ {formatCurrency(tier.price)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-green-400">
                      {formatCurrency(tier.revenue)}
                    </span>
                  </td>
                  {forecasts.map((f, fi) => (
                    <td key={fi} className="px-3 py-1.5 text-right">
                      <span className="text-sm font-mono tabular-nums text-green-400/60">
                        {formatCurrency(f.tierRevs[ti])}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-1.5" />
                </tr>
              ))}

              {financials.ticketTiers.length === 0 && (
                <tr className="border-b border-border/50">
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    Tickets
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground text-sm italic">
                    No ticket tiers configured
                  </td>
                  <td className="px-4 py-1.5 text-right text-sm font-mono text-muted-foreground">
                    $0.00
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-muted-foreground/40">—</td>
                  ))}
                  <td />
                </tr>
              )}

              {/* Custom Revenue Lines (editable) — bar revenue, sponsorship,
                  merch, etc. Same edit-in-place + delete pattern as expenses. */}
              {financials.revenueLines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors group"
                >
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    {categoryLabel(line.category)}
                  </td>
                  <td className="px-4 py-1.5">
                    <EditableTextCell
                      value={line.description}
                      onSave={async (v) => {
                        await handleUpdateRevenue(line.id, "description", v);
                      }}
                    />
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end">
                      <EditableAmountCell
                        value={line.amount}
                        onSave={async (v) => {
                          await handleUpdateRevenue(line.id, "amount", v);
                        }}
                      />
                    </div>
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-muted-foreground/30">
                      —
                    </td>
                  ))}
                  <td className="px-4 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete revenue line"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all"
                      onClick={() => handleDeleteRevenue(line.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}

              {/* Add Revenue Line */}
              <AddRevenueRow eventId={financials.eventId} />

              {/* Estimated Bar Revenue (read-only forecast hint — does NOT count
                  toward gross. Actual bar revenue is tracked as a revenue line.) */}
              {financials.estimatedBarRevenue != null && financials.estimatedBarRevenue > 0 && (
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">Bar (est)</td>
                  <td className="px-4 py-1.5 text-sm text-muted-foreground italic">
                    Estimated Bar Revenue (forecast only)
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-muted-foreground">
                      {formatCurrency(financials.estimatedBarRevenue)}
                    </span>
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5" />
                  ))}
                  <td />
                </tr>
              )}

              {/* Revenue Subtotal */}
              <tr className="border-b border-border bg-green-500/5">
                <td className="px-4 py-1.5" />
                <td className="px-4 py-1.5 text-right text-xs font-semibold text-green-400 uppercase">
                  Gross Revenue
                </td>
                <td className="px-4 py-1.5 text-right">
                  <span className="text-sm font-bold font-mono tabular-nums text-green-400">
                    {formatCurrency(financials.grossRevenue)}
                  </span>
                </td>
                {forecasts.map((f, fi) => (
                  <td key={fi} className="px-3 py-1.5 text-right">
                    <span className="text-sm font-bold font-mono tabular-nums text-green-400/70">
                      {formatCurrency(f.gross)}
                    </span>
                  </td>
                ))}
                <td />
              </tr>

              {/* ── EXPENSES SECTION ───────────────────────────── */}
              <tr className="border-b border-border bg-red-500/5">
                <td colSpan={8} className="px-4 py-1.5">
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
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    Venue
                  </td>
                  <td className="px-4 py-1.5 text-sm">Venue Cost</td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-red-400">
                      ({formatCurrency(financials.venueCost)})
                    </span>
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-red-400/40">
                      ({formatCurrency(financials.venueCost!)})
                    </td>
                  ))}
                  <td />
                </tr>
              )}

              {/* Venue Deposit */}
              {financials.venueDeposit != null && financials.venueDeposit > 0 && (
                <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    Venue
                  </td>
                  <td className="px-4 py-1.5 text-sm">Venue Deposit</td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-red-400/70">
                      ({formatCurrency(financials.venueDeposit)})
                    </span>
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-red-400/30">
                      ({formatCurrency(financials.venueDeposit!)})
                    </td>
                  ))}
                  <td />
                </tr>
              )}

              {/* Custom Expenses (Editable) */}
              {financials.expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors group"
                >
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">
                    {categoryLabel(expense.category)}
                  </td>
                  <td className="px-4 py-1.5">
                    <EditableTextCell
                      value={expense.description}
                      onSave={async (v) => {
                        await handleUpdateExpense(expense.id, "description", v);
                      }}
                    />
                  </td>
                  <td className="px-4 py-1.5 text-right">
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
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-red-400/30">
                      ({formatCurrency(expense.amount)})
                    </td>
                  ))}
                  <td className="px-4 py-1.5 text-center">
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

              {/* Bar Minimum Shortfall (auto-computed). Only renders when the
                  organizer has both filled in a minimum AND a real actual,
                  AND actual fell short. This is the dollars they owe the
                  venue out of pocket. */}
              {financials.barShortfall > 0 && (
                <tr className="border-b border-border/50 bg-amber-500/5">
                  <td className="px-4 py-1.5 text-muted-foreground text-xs">Bar</td>
                  <td className="px-4 py-1.5 text-sm">
                    <div className="flex flex-col">
                      <span>Bar Minimum Shortfall</span>
                      <span className="text-xs text-muted-foreground">
                        Owed to venue ({formatCurrency(financials.barMinimum ?? 0)} min &minus; {formatCurrency(financials.actualBarRevenue ?? 0)} actual)
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-sm font-mono tabular-nums text-amber-400">
                      ({formatCurrency(financials.barShortfall)})
                    </span>
                  </td>
                  {fLabels.map((_, i) => (
                    <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-amber-400/30">
                      ({formatCurrency(financials.barShortfall)})
                    </td>
                  ))}
                  <td />
                </tr>
              )}

              {/* Expenses Subtotal */}
              <tr className="border-b border-border bg-red-500/5">
                <td className="px-4 py-1.5" />
                <td className="px-4 py-1.5 text-right text-xs font-semibold text-red-400 uppercase">
                  Total Expenses
                </td>
                <td className="px-4 py-1.5 text-right">
                  <span className="text-sm font-bold font-mono tabular-nums text-red-400">
                    ({formatCurrency(financials.totalExpenses + (financials.venueCost ?? 0) + financials.barShortfall)})
                  </span>
                </td>
                {fLabels.map((_, i) => (
                  <td key={i} className="px-3 py-1.5 text-right">
                    <span className="text-sm font-bold font-mono tabular-nums text-red-400/50">
                      ({formatCurrency(financials.totalExpenses + (financials.venueCost ?? 0) + financials.barShortfall)})
                    </span>
                  </td>
                ))}
                <td />
              </tr>

              {/* ── ARTIST FEES SECTION ────────────────────────── */}
              {financials.artistFees.length > 0 && (
                <>
                  <tr className="border-b border-border bg-amber-500/5">
                    <td colSpan={8} className="px-4 py-1.5">
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
                      <td className="px-4 py-1.5 text-muted-foreground text-xs">
                        Artist
                      </td>
                      <td className="px-4 py-1.5 text-sm">{artist.artistName}</td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="text-sm font-mono tabular-nums text-amber-400">
                          ({formatCurrency(artist.fee)})
                        </span>
                      </td>
                      {fLabels.map((_, i) => (
                        <td key={i} className="px-3 py-1.5 text-right text-sm font-mono text-amber-400/30">
                          ({formatCurrency(artist.fee)})
                        </td>
                      ))}
                      <td />
                    </tr>
                  ))}

                  <tr className="border-b border-border bg-amber-500/5">
                    <td className="px-4 py-1.5" />
                    <td className="px-4 py-1.5 text-right text-xs font-semibold text-amber-400 uppercase">
                      Total Artist Fees
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <span className="text-sm font-bold font-mono tabular-nums text-amber-400">
                        ({formatCurrency(financials.totalArtistFees)})
                      </span>
                    </td>
                    {fLabels.map((_, i) => (
                      <td key={i} className="px-3 py-1.5 text-right">
                        <span className="text-sm font-bold font-mono tabular-nums text-amber-400/50">
                          ({formatCurrency(financials.totalArtistFees)})
                        </span>
                      </td>
                    ))}
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
                {forecasts.map((f, fi) => (
                  <td key={fi} className="px-3 py-4 text-right">
                    <span className={`text-sm font-bold font-mono tabular-nums ${
                      f.profit >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {f.profit < 0 && "−"}{formatCurrency(Math.abs(f.profit))}
                    </span>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      </div>{/* close pnlRef wrapper */}

      {/* Bar Settings — editable minimum and actual.
          The shortfall is computed server-side from these two and rendered
          as an expense line above. Click either number to edit it inline. */}
      <div className="rounded-xl border border-border p-4 bg-card space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">Bar Minimum &amp; Actuals</p>
            <p className="text-xs text-muted-foreground">
              Track venue bar minimums. If actuals fall short, the difference shows up as an expense automatically.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Bar Minimum
            </p>
            <EditableAmountCell
              value={financials.barMinimum ?? 0}
              onSave={async (v) => {
                await handleUpdateBarSettings("barMinimum", v);
              }}
            />
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Actual Bar Revenue
            </p>
            <EditableAmountCell
              value={financials.actualBarRevenue ?? 0}
              onSave={async (v) => {
                await handleUpdateBarSettings("actualBarRevenue", v);
              }}
            />
          </div>
        </div>
        {financials.barMinimum != null && financials.barMinimum > 0 && (
          <p
            className={`text-xs ${
              financials.barShortfall > 0
                ? "text-amber-400"
                : financials.actualBarRevenue != null
                  ? "text-green-400"
                  : "text-muted-foreground"
            }`}
          >
            {financials.barShortfall > 0
              ? `${formatCurrency(financials.barShortfall)} short — added to expenses`
              : financials.actualBarRevenue != null
                ? "Minimum met"
                : "Enter actual bar revenue to track shortfall"}
          </p>
        )}
      </div>
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
