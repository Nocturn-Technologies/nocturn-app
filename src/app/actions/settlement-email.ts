"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { sendEmail } from "@/lib/email/send";
import { isValidUUID } from "@/lib/utils";

// Strip characters that would break a plain-text email rendering. This is
// NOT html escaping — the settlement report is sent as plain text (no HTML
// alternative), so encoding `&` as `&amp;` would render literal `&amp;` in
// Gmail. We only drop control characters and newlines that could header-
// inject or mangle the body layout.
function sanitizePlainText(str: string): string {
  // Remove control chars except tab/newline (we want newlines inside body)
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

// Generate a settlement report email and return it (for now, no Resend — just generates the content)
export async function generateSettlementReport(settlementId: string) {
  try {
  if (!settlementId?.trim()) return { error: "Settlement ID is required", report: null };
  if (!isValidUUID(settlementId)) return { error: "Invalid settlement ID format", report: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", report: null };

  const admin = createAdminClient();

  // Get settlement with event and collective (venue info is now inline on events)
  const { data: settlement, error: settlementError } = await admin
    .from("settlements")
    .select("*, events(title, starts_at, venue_name, venue_address, city), collectives(name)")
    .eq("id", settlementId)
    .maybeSingle();

  if (settlementError) {
    console.error("[generateSettlementReport] DB error:", settlementError);
    return { error: "Something went wrong", report: null };
  }
  if (!settlement) return { error: "Settlement not found", report: null };

  // Verify user is an admin or promoter of this collective
  const { data: membership } = await admin
    .from("collective_members")
    .select("role")
    .eq("collective_id", settlement.collective_id)
    .eq("user_id", user.id)
    .in("role", ["admin", "promoter"])
    .is("deleted_at", null)
    .maybeSingle();
  if (!membership) return { error: "Not authorized", report: null };

  // Get line items
  const { data: lines } = await admin
    .from("settlement_lines")
    .select("*")
    .eq("settlement_id", settlementId)
    .order("created_at");

  // Get collective members for emailing
  const { data: members } = await admin
    .from("collective_members")
    .select("users(full_name, email)")
    .eq("collective_id", settlement.collective_id)
    .is("deleted_at", null);

  const event = settlement.events as unknown as {
    title: string;
    starts_at: string;
    venue_name: string | null;
    venue_address: string | null;
    city: string | null;
  } | null;
  const collective = settlement.collectives as unknown as { name: string } | null;

  if (!event) {
    return { error: "Event associated with this settlement no longer exists", report: null };
  }

  const eventDate = new Date(event.starts_at).toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build venue display string from inline event columns
  let venueDisplay = "N/A";
  if (event.venue_name) {
    venueDisplay = event.venue_name;
    if (event.city) venueDisplay += `, ${event.city}`;
  } else if (event.city) {
    venueDisplay = event.city;
  }

  const recipientEmails = (members ?? [])
    .map((m) => {
      const u = m.users as unknown as { full_name: string; email: string } | null;
      return u?.email;
    })
    .filter(Boolean) as string[];

  // Build report
  const deductions = (lines ?? [])
    .map((l) => `  • ${l.description}: -$${Number(l.amount).toFixed(2)}`)
    .join("\n");

  const collectiveName = sanitizePlainText(collective?.name ?? "Your Collective");
  const safeEventTitle = sanitizePlainText(event.title);
  const safeVenueDisplay = sanitizePlainText(venueDisplay);
  // Strip newlines from subject to prevent header injection.
  const subject = `Settlement Report: ${safeEventTitle} — ${collectiveName}`.replace(/[\r\n]/g, " ");

  const body = `Hi ${collectiveName},

Here's the settlement report for ${safeEventTitle}.

EVENT DETAILS
━━━━━━━━━━━━
Event: ${safeEventTitle}
Date: ${eventDate}
Venue: ${safeVenueDisplay}

FINANCIAL SUMMARY
━━━━━━━━━━━━━━━━
Total Revenue:    $${Number(settlement.total_revenue).toFixed(2)}
Platform Fee:     -$${Number(settlement.platform_fee).toFixed(2)}
Stripe Fee:       -$${Number(settlement.stripe_fee).toFixed(2)}

Deductions:
${deductions || "  (none)"}

━━━━━━━━━━━━━━━━
Net Payout:       $${Number(settlement.net_payout ?? 0).toFixed(2)}
Status:           ${(settlement.status ?? "pending").toUpperCase()}

${settlement.status === "paid" ? "Payout has been processed." : "Payout pending approval."}

This report was generated by Nocturn.
View full details: ${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/dashboard/finance/${settlement.event_id}

— Nocturn`;

  // Route through the shared sendEmail helper so we get retries, a
  // consistent verified FROM, and dev-mode skip behavior.
  //
  // sendEmail() only accepts HTML, so wrap the plain-text body in a <pre>
  // block that preserves whitespace.
  let sent = false;
  if (recipientEmails.length > 0) {
    const htmlBody = `<pre style="font-family:-apple-system,Menlo,monospace;white-space:pre-wrap;color:#FAFAFA;background:#09090B;padding:24px;font-size:13px;line-height:1.6;">${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
    // Deduplicate recipients — multiple collective_members rows can point
    // to the same email if someone was added twice.
    const uniqueRecipients = Array.from(new Set(recipientEmails.map((e) => e.toLowerCase().trim())));
    const results = await Promise.allSettled(
      uniqueRecipients.map((to) =>
        sendEmail({
          to,
          subject,
          html: htmlBody,
        })
      )
    );
    sent = results.some((r) => r.status === "fulfilled" && !r.value.error);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[settlement-email] send rejected:", r.reason);
      } else if (r.value.error) {
        console.error("[settlement-email] send failed:", r.value.error);
      }
    }
  }

  return {
    error: null,
    report: {
      subject,
      body,
      recipients: recipientEmails,
      sent,
    },
  };
  } catch (err) {
    console.error("[generateSettlementReport]", err);
    return { error: "Something went wrong", report: null };
  }
}
