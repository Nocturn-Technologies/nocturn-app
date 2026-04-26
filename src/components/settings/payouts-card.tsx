"use client";

/**
 * Payouts card — Settings page integration for Stripe Connect (Express).
 *
 * Three states:
 *   1. Not connected — "Set up payouts" CTA. Creates the Express account
 *      on click (idempotent) and redirects to Stripe's hosted onboarding.
 *   2. Pending — onboarding started but Stripe flagged outstanding
 *      requirements (details_submitted but charges_enabled/payouts_enabled
 *      not yet true). Lists what's missing; "Finish setup" re-enters
 *      onboarding.
 *   3. Ready — charges_enabled && payouts_enabled. Shows "Manage in Stripe"
 *      (login link to Express dashboard).
 *
 * Status is fetched directly from Stripe on mount — the DB only stores
 * the account id, never a cached copy of enablement flags.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Clock,
} from "lucide-react";
import {
  createOnboardingLink,
  getConnectStatus,
  createLoginLink,
  type ConnectStatus,
} from "@/app/actions/stripe-connect";

interface PayoutsCardProps {
  collectiveId: string;
}

export function PayoutsCard({ collectiveId }: PayoutsCardProps) {
  const searchParams = useSearchParams();
  const returnFlag = searchParams.get("stripe"); // "connected" | "error" | null

  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [err, setErr] = useState<string | null>(
    returnFlag === "error" ? "Something went wrong with Stripe onboarding." : null
  );

  // Fetch status on mount. When the operator is returning from the
  // Stripe return route (?stripe=connected), force a live refresh since
  // the denorm cache is almost certainly stale — the account.updated
  // webhook may not have arrived yet.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getConnectStatus(collectiveId, {
        forceRefresh: returnFlag === "connected",
      });
      if (cancelled) return;
      if (result.error) {
        setErr(result.error);
      } else {
        setStatus(result.status);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [collectiveId, returnFlag]);

  async function handleStartOnboarding() {
    setActionInFlight(true);
    setErr(null);
    const result = await createOnboardingLink(collectiveId);
    if (result.error || !result.url) {
      setErr(result.error ?? "Failed to start onboarding");
      setActionInFlight(false);
      return;
    }
    // Hard redirect — this takes the operator off-site to Stripe.
    window.location.href = result.url;
  }

  async function handleManage() {
    setActionInFlight(true);
    setErr(null);
    const result = await createLoginLink(collectiveId);
    if (result.error || !result.url) {
      setErr(result.error ?? "Failed to open Stripe dashboard");
      setActionInFlight(false);
      return;
    }
    // Open in a new tab so operator can come back to Nocturn easily.
    window.open(result.url, "_blank", "noopener,noreferrer");
    setActionInFlight(false);
  }

  // ──────────────────── Render ────────────────────

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
          <CardDescription>Loading Stripe status…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-10 w-40 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const hasAccount = !!status?.accountId;
  const isReady =
    hasAccount && status.chargesEnabled && status.payoutsEnabled;
  const isPending =
    hasAccount &&
    status.detailsSubmitted &&
    !(status.chargesEnabled && status.payoutsEnabled);
  const isDraft = hasAccount && !status.detailsSubmitted;
  const isNotConnected = !hasAccount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Payouts
          {isReady && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
              <Check className="h-3 w-3" /> Ready
            </span>
          )}
          {(isPending || isDraft) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[11px] font-medium text-yellow-500">
              <Clock className="h-3 w-3" /> Pending
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {isNotConnected &&
            "Connect your bank account to receive ticket revenue after each event."}
          {isDraft &&
            "You started Stripe setup — finish it to start receiving payouts."}
          {isPending &&
            "Stripe needs a bit more info before your payouts can start."}
          {isReady &&
            "Your bank account is connected. Settled events pay out automatically after you approve them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        {returnFlag === "connected" && !err && isReady && (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-500">
            <Check className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Stripe onboarding complete. You&apos;re ready to receive payouts.</span>
          </div>
        )}

        {/* ──────── State: Not connected ──────── */}
        {isNotConnected && (
          <>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">No business registration needed</strong> — works as
              an individual with your personal bank account. Legal name, date of birth, SIN/SSN last
              digits, and a chequing account are all Stripe asks for.
            </p>
            <Button
              onClick={handleStartOnboarding}
              disabled={actionInFlight}
              className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
            >
              {actionInFlight && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionInFlight ? "Redirecting to Stripe…" : "Set up payouts"}
            </Button>
          </>
        )}

        {/* ──────── State: Started but not submitted ──────── */}
        {isDraft && (
          <Button
            onClick={handleStartOnboarding}
            disabled={actionInFlight}
            className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
          >
            {actionInFlight && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionInFlight ? "Opening Stripe…" : "Finish Stripe setup"}
          </Button>
        )}

        {/* ──────── State: Submitted, pending verification ──────── */}
        {isPending && (
          <>
            {status.requirements.length > 0 && (
              <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-3">
                <p className="text-xs font-medium text-yellow-500 mb-1">
                  Stripe needs:
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {status.requirements.map((r) => (
                    <li key={r}>• {humanizeRequirement(r)}</li>
                  ))}
                </ul>
              </div>
            )}
            {status.disabledReason && (
              <p className="text-xs text-muted-foreground">
                Status: {status.disabledReason.replace(/_/g, " ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleStartOnboarding}
                disabled={actionInFlight}
                className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
              >
                {actionInFlight && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {actionInFlight ? "Opening Stripe…" : "Provide missing info"}
              </Button>
              <Button
                variant="outline"
                onClick={handleManage}
                disabled={actionInFlight}
                className="min-h-[44px] transition-all duration-200 active:scale-[0.98]"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Manage in Stripe
              </Button>
            </div>
          </>
        )}

        {/* ──────── State: Ready ──────── */}
        {isReady && (
          <>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-500">
                  Payouts are live
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your first payout may take 5–7 days while Stripe verifies your account. After that,
                standard payouts land in 2 business days. Use Instant Payout in your Stripe
                dashboard for ~30-min delivery to a debit card (1% fee).
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleManage}
              disabled={actionInFlight}
              className="min-h-[44px] transition-all duration-200 active:scale-[0.98]"
            >
              {actionInFlight ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Manage in Stripe
            </Button>
          </>
        )}

        {/* ──────── Tax note (always visible once any setup started) ──────── */}
        {hasAccount && (
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-white/5">
            Payouts count as self-employment income. Stripe issues a tax summary at year-end
            (1099-K in the US, annual summary in Canada). Consult your accountant.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Stripe returns machine-readable requirement codes like
// "individual.verification.document". These are the most common ones
// operators hit; the rest fall through to a titleized string so nothing is
// dropped.
function humanizeRequirement(req: string): string {
  const MAP: Record<string, string> = {
    "individual.verification.document": "Photo ID (driver's license or passport)",
    "individual.verification.additional_document": "Proof of address",
    "individual.id_number": "SIN or SSN",
    "individual.ssn_last_4": "Last 4 of SSN",
    "individual.dob.day": "Date of birth",
    "individual.dob.month": "Date of birth",
    "individual.dob.year": "Date of birth",
    "individual.first_name": "First name",
    "individual.last_name": "Last name",
    "individual.address.line1": "Home address",
    "individual.address.city": "City",
    "individual.address.postal_code": "Postal / ZIP code",
    "individual.phone": "Phone number",
    "external_account": "Bank account details",
    "business_profile.url": "Website or social URL",
    "business_profile.mcc": "Business category",
    "tos_acceptance.date": "Terms of service acceptance",
    "tos_acceptance.ip": "Terms of service acceptance",
  };
  if (MAP[req]) return MAP[req];
  // Fallback: turn "individual.foo_bar" into "Foo bar (individual)"
  return req.replace(/_/g, " ").replace(/\./g, " — ");
}
