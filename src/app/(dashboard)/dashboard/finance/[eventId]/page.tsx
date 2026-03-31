"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  TrendingUp,
  ArrowLeft,
  CheckCircle,
  Plus,
  Trash2,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  generateSettlement,
  getSettlement,
  approveSettlement,
  addEventExpense,
  getEventExpenses,
} from "@/app/actions/settlements";
import { markSettlementPaid } from "@/app/actions/payouts";
import { generateSettlementReport } from "@/app/actions/settlement-email";

export default function SettlementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [settlement, setSettlement] = useState<Record<string, unknown> | null>(null);
  const [lines, setLines] = useState<Array<Record<string, unknown>>>([]);
  const [expenses, setExpenses] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("other");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    setLoading(true);
    const [settlementData, expenseData] = await Promise.all([
      getSettlement(eventId),
      getEventExpenses(eventId),
    ]);
    setSettlement(settlementData.settlement);
    setLines(settlementData.lines as Array<Record<string, unknown>>);
    setExpenses(expenseData as Array<Record<string, unknown>>);
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const result = await generateSettlement(eventId);
    if (result.error && !result.settlementId) {
      setError(result.error);
      setGenerating(false);
      return;
    }
    await loadData();
    setGenerating(false);
  }

  async function handleApprove() {
    if (!settlement) return;
    setApproving(true);
    const result = await approveSettlement(settlement.id as string);
    if (result.error) {
      setError(result.error);
      setApproving(false);
      return;
    }
    await loadData();
    setApproving(false);
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setAddingExpense(true);
    const result = await addEventExpense({
      eventId,
      category: expenseCategory,
      description: expenseDescription,
      amount: parseFloat(expenseAmount),
    });
    if (result.error) {
      setError(result.error);
    } else {
      setExpenseDescription("");
      setExpenseAmount("");
      setShowExpenseForm(false);
      await loadData();
    }
    setAddingExpense(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  const categories = [
    "venue", "sound", "lighting", "security", "marketing",
    "decor", "permits", "insurance", "other",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance">
          <Button variant="ghost" size="icon" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-heading">Event Settlement</h1>
          <p className="text-sm text-muted-foreground">P&amp;L breakdown</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
      )}

      {/* Expenses section (always visible) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Event Expenses</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExpenseForm(!showExpenseForm)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Expense
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showExpenseForm && (
            <form onSubmit={handleAddExpense} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    placeholder="e.g. Sound system rental"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={addingExpense}
              >
                {addingExpense ? "Adding..." : "Add"}
              </Button>
            </form>
          )}

          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((exp) => (
                <div
                  key={exp.id as string}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                >
                  <div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">
                      {String(exp.category)}
                    </span>
                    <span className="ml-2">{String(exp.description)}</span>
                  </div>
                  <span className="font-medium">${Number(exp.amount).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total Expenses</span>
                <span>
                  ${expenses.reduce((s, e) => s + Number(e.amount), 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement */}
      {!settlement ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No settlement generated yet</p>
              <p className="text-sm text-muted-foreground">
                Add any expenses above first, then generate the settlement.
              </p>
            </div>
            <Button
              className="bg-nocturn hover:bg-nocturn-light"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generating..." : "Generate Settlement"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* P&L Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">P&amp;L Summary</CardTitle>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    settlement.status === "draft"
                      ? "bg-yellow-500/10 text-yellow-500"
                      : settlement.status === "approved"
                      ? "bg-blue-500/10 text-blue-500"
                      : settlement.status === "paid"
                      ? "bg-green-500/10 text-green-500"
                      : ""
                  }`}
                >
                  {String(settlement.status)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Revenue */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Revenue (ticket sales)</span>
                  <span className="font-medium text-green-500">
                    +${Number(settlement.gross_revenue).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-1 border-t pt-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Deductions
                </p>
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No deductions</p>
                ) : (
                  lines.map((line) => (
                    <div key={line.id as string} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{String(line.label)}</span>
                      <span className="text-red-400">
                        -${Number(line.amount).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Net */}
              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Net Profit</span>
                <span className={Number(settlement.profit) >= 0 ? "text-green-500" : "text-red-500"}>
                  ${Number(settlement.profit).toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {settlement.status === "draft" && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1 bg-nocturn hover:bg-nocturn-light"
                onClick={handleApprove}
                disabled={approving}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {approving ? "Approving..." : "Approve Settlement"}
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          )}

          {settlement.status === "approved" && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={async () => {
                setPayingOut(true);
                setError(null);
                const result = await markSettlementPaid(settlement.id as string);
                if (result.error) setError(result.error);
                await loadData();
                setPayingOut(false);
              }}
              disabled={payingOut}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {payingOut ? "Marking as Paid..." : "Mark as Paid (Manual Payout)"}
            </Button>
          )}

          {settlement.status === "paid" && (
            <div className="rounded-lg bg-green-500/10 p-4 text-center text-green-500 font-medium">
              Settlement complete — payout confirmed
            </div>
          )}

          {/* Settlement Report */}
          {settlement && (settlement.status === "approved" || settlement.status === "paid") && (
            <Button
              variant="outline"
              className="w-full"
              disabled={generatingReport}
              onClick={async () => {
                if (generatingReport) return;
                setGeneratingReport(true);
                try {
                  const result = await generateSettlementReport(settlement.id as string);
                  if (result.report) {
                    await navigator.clipboard.writeText(`Subject: ${result.report.subject}\n\n${result.report.body}`);
                    setReportCopied(true);
                    setTimeout(() => setReportCopied(false), 3000);
                  }
                } finally {
                  setGeneratingReport(false);
                }
              }}
            >
              {reportCopied ? (
                <><Check className="mr-2 h-4 w-4" /> Report Copied to Clipboard</>
              ) : (
                <><Mail className="mr-2 h-4 w-4" /> Copy Settlement Report</>
              )}
            </Button>
          )}
          {/* Payout info */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-nocturn" />
              How payouts work
            </h3>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>All ticket revenue is collected by Nocturn. After settlement is approved, payouts are processed within <span className="text-foreground font-medium">7-14 business days</span>.</p>
              <p>Your collective keeps <span className="text-green-400 font-medium">100% of the ticket price</span>. The 7% + $0.50 service fee is paid by the buyer, not you.</p>
              {settlement.status === "draft" && (
                <p className="text-nocturn">Approve this settlement to start the payout process.</p>
              )}
              {settlement.status === "approved" && (
                <p className="text-amber-400">Payout is being prepared. You'll receive funds via e-transfer or direct deposit.</p>
              )}
              {settlement.status === "paid" && (
                <p className="text-green-400">Payout has been sent. Check your bank account.</p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Questions? <a href="mailto:shawn@trynocturn.com" className="underline hover:text-muted-foreground">shawn@trynocturn.com</a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
