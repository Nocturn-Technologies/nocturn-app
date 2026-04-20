"use client";

/**
 * SettlementActions — Approve and Mark-Paid controls for the per-event
 * financials page. Rendered below the P&L spreadsheet.
 *
 * State machine (driven by settlement.status):
 *   - null           → "Generate settlement" (handled elsewhere)
 *   - draft          → "Approve settlement" button visible
 *   - approved       → "Pay out via Stripe" button visible (disabled if
 *                      Connect not ready)
 *   - paid_out       → read-only payout status pipeline
 *
 * Also shows the payout pipeline once a transfer has been initiated:
 *   pending → processing → completed (or failed with retry)
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { approveSettlement } from "@/app/actions/settlements";
import { markSettlementPaid, getPayoutStatus } from "@/app/actions/payouts";
import { getConnectStatus } from "@/app/actions/stripe-connect";

interface SettlementActionsProps {
  settlementId: string;
  collectiveId: string;
  eventId: string;
  status: "draft" | "pending_approval" | "approved" | "paid_out";
  profit: number;
}

type Payout = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  amount: number;
  currency: string | null;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

export function SettlementActions({
  settlementId,
  collectiveId,
  eventId: _eventId,
  status,
  profit,
}: SettlementActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [connectReady, setConnectReady] = useState<boolean | null>(null);

  // Load current payout state + Connect readiness in parallel on mount.
  // Re-runs whenever settlement status changes (post-action server refresh).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [payoutResult, connectResult] = await Promise.all([
        getPayoutStatus(settlementId),
        getConnectStatus(collectiveId),
      ]);
      if (cancelled) return;
      if (!payoutResult.error && payoutResult.payout) {
        setPayout(payoutResult.payout as unknown as Payout);
      }
      if (!connectResult.error && connectResult.status) {
        setConnectReady(
          connectResult.status.chargesEnabled &&
            connectResult.status.payoutsEnabled
        );
      } else {
        setConnectReady(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [settlementId, collectiveId, status]);

  async function handleApprove() {
    setErr(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await approveSettlement(settlementId);
      if (result.error) {
        setErr(result.error);
      } else {
        setSuccess("Settlement approved. Ready to pay out.");
        router.refresh();
      }
    });
  }

  async function handleMarkPaid() {
    setErr(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await markSettlementPaid(settlementId);
      if (result.error) {
        setErr(result.error);
      } else {
        setSuccess(
          "Transfer initiated. Funds are on their way to your Stripe balance."
        );
        router.refresh();
      }
    });
  }

  // Render the payout pipeline when we have a payout row (any status).
  const showPipeline = payout !== null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Settlement & Payout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-500">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* ──────── Draft → Approve ──────── */}
        {status === "draft" && (
          <>
            <p className="text-sm text-muted-foreground">
              Review the P&amp;L above, then approve the settlement to unlock the
              payout.
            </p>
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Approving…" : "Approve settlement"}
            </Button>
          </>
        )}

        {/* ──────── Approved → Mark Paid ──────── */}
        {status === "approved" && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Payout amount</p>
                <p className="text-xl font-bold font-heading">
                  ${profit.toFixed(2)}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            </div>

            {connectReady === false && (
              <div className="flex items-start gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-yellow-500">
                    Finish Stripe setup first
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your collective needs a connected bank account before payouts can go
                    through.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-nocturn hover:underline"
                  >
                    Set up in Settings
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            <Button
              onClick={handleMarkPaid}
              disabled={isPending || connectReady !== true}
              className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {isPending ? "Sending transfer…" : "Pay out via Stripe"}
            </Button>
          </>
        )}

        {/* ──────── Paid out → Pipeline ──────── */}
        {showPipeline && payout && (
          <PayoutPipeline payout={payout} />
        )}

        {/* Retry if last payout failed — settlement bounced back to approved */}
        {payout?.status === "failed" && status === "approved" && (
          <Button
            onClick={handleMarkPaid}
            disabled={isPending || connectReady !== true}
            variant="outline"
            className="min-h-[44px] transition-all duration-200 active:scale-[0.98]"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Retry payout
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PayoutPipeline({ payout }: { payout: Payout }) {
  const steps: {
    key: Payout["status"] | "initiated";
    label: string;
    description: string;
  }[] = [
    {
      key: "pending",
      label: "Sending",
      description: "Moving funds to your Stripe balance…",
    },
    {
      key: "processing",
      label: "In Stripe balance",
      description:
        "Standard payout in 2 business days. Use Instant Payout in your Stripe dashboard for ~30 min delivery (1% fee).",
    },
    {
      key: "completed",
      label: "Paid out",
      description: payout.completed_at
        ? `Funds landed ${new Date(payout.completed_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
        : "Funds have landed in your bank account",
    },
  ];

  const currentIdx = (() => {
    if (payout.status === "completed") return 2;
    if (payout.status === "processing") return 1;
    if (payout.status === "failed") return -1;
    return 0; // pending
  })();

  if (payout.status === "failed") {
    return (
      <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm font-medium text-destructive">Payout failed</p>
        </div>
        {payout.failure_reason && (
          <p className="text-xs text-muted-foreground">
            {payout.failure_reason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isComplete = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    isComplete
                      ? isCurrent && payout.status !== "completed"
                        ? "bg-yellow-500/20"
                        : "bg-emerald-500/20"
                      : "bg-muted/30"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2
                      className={`h-4 w-4 ${
                        isCurrent && payout.status !== "completed"
                          ? "text-yellow-500"
                          : "text-emerald-500"
                      }`}
                    />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground/50" />
                  )}
                </div>
                <span
                  className={`text-[11px] text-center leading-tight ${
                    isComplete
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-1 mt-[-16px] h-0.5 flex-1 rounded ${
                    i < currentIdx ? "bg-emerald-500/40" : "bg-muted/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {currentIdx >= 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {steps[currentIdx]?.description}
        </p>
      )}
    </div>
  );
}
