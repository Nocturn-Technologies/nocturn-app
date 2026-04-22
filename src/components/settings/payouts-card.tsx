"use client";

/**
 * Payouts card — INTERIM GATED STATE (NOC-40).
 *
 * Stripe Connect was dropped from the schema in PR #93 (collectives.
 * stripe_account_id removed). The real CTAs route into stripe-connect.ts
 * which 4xx's immediately. Until NOC-39 (schema restore of the reference
 * column) + follow-up code ticket (live-fetch refactor) land, this card
 * shows a display-only "coming soon" notice so operators don't click into
 * errors during demos.
 *
 * When Connect is back online, restore this file from git history (the
 * previous implementation is intact on the commit before NOC-40).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock } from "lucide-react";

interface PayoutsCardProps {
  // Kept for API compatibility with the parent — unused during the pause.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  collectiveId: string;
}

export function PayoutsCard(_props: PayoutsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Payouts
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[11px] font-medium text-yellow-500">
            <Clock className="h-3 w-3" /> Coming soon
          </span>
        </CardTitle>
        <CardDescription>
          Automated ticket-revenue payouts via Stripe Connect are being wired up.
          In the meantime, settlements land in the Nocturn platform account and
          are transferred to your collective manually after each event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You&apos;ll get an email from us the week this goes live — no action
          needed on your end for now.
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed pt-3 mt-3 border-t border-white/5">
          Payouts count as self-employment income. Stripe will issue a tax
          summary at year-end (1099-K in the US, annual summary in Canada).
          Consult your accountant.
        </p>
      </CardContent>
    </Card>
  );
}
