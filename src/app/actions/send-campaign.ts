"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Send an email campaign to all attendees of an event.
 * Uses the generated subject + body from the email composer.
 */
export async function sendCampaignEmail(input: {
  eventId: string;
  subject: string;
  body: string;
}) {
  try {
  // Input validation
  if (!input.eventId || typeof input.eventId !== "string") return { error: "Invalid event ID", sent: 0 };
  if (!input.subject || input.subject.length > 200) return { error: "Subject is required and must be under 200 characters", sent: 0 };
  if (!input.body || input.body.length > 10000) return { error: "Body is required and must be under 10,000 characters", sent: 0 };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", sent: 0 };

  const { success } = await rateLimitStrict(`campaign:${user.id}`, 3, 60_000);
  if (!success) return { error: "Rate limit exceeded. Please wait before sending another campaign.", sent: 0 };

  const sb = createAdminClient();

  // Get event to verify ownership and get collective_id
  const { data: event } = await sb
    .from("events")
    .select("id, title, collective_id")
    .eq("id", input.eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", sent: 0 };

  // Verify user is an admin or promoter of this collective
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", event.collective_id)
    .in("role", ["admin", "promoter"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) return { error: "Only admins and promoters can send campaigns", sent: 0 };

  // Get all attendee emails for this collective from attendee_profiles
  // attendee_profiles has email directly and is scoped to collective_id
  const { data: attendees } = await sb
    .from("attendee_profiles")
    .select("email")
    .eq("collective_id", event.collective_id)
    .not("email", "is", null);

  // Deduplicate emails
  const emails = new Set<string>();
  for (const attendee of attendees ?? []) {
    if (attendee.email) emails.add(attendee.email.toLowerCase().trim());
  }

  if (emails.size === 0) {
    return { error: "No attendees found for this event", sent: 0 };
  }

  // Sanitize subject line: remove newlines and control characters
  const sanitizedSubject = input.subject.replace(/[\r\n\t\x00-\x1F\x7F]/g, " ").trim();

  // Escape HTML to prevent XSS in email content
  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Build HTML email from plain text body
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const eventTitle = escapeHtml(event.title.replace(/[\r\n\t\x00-\x1f]/g, "")).slice(0, 200);
  const htmlBody = input.body
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p>${escapeHtml(line)}</p>`))
    .join("");

  function buildHtml(recipientEmail: string) {
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
      <div style="margin-bottom: 24px;">
        <span style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</span>
      </div>
      <div style="line-height: 1.7; font-size: 15px; color: #E4E4E7;">
        ${htmlBody}
      </div>
      <hr style="border: none; border-top: 1px solid #27272A; margin: 32px 0;" />
      <p style="font-size: 12px; color: #71717A;">
        You're receiving this because you attended ${eventTitle} via Nocturn.
        <br/>
        <a href="${appUrl}" style="color: #7B2FF7;">Powered by Nocturn</a>
      </p>
      <p style="color: #71717A; font-size: 11px; margin-top: 32px; text-align: center;">
        To stop receiving emails, <a href="mailto:support@trynocturn.com?subject=Unsubscribe&body=Please%20unsubscribe%20${encodeURIComponent(recipientEmail)}" style="color: #7B2FF7; text-decoration: underline;">unsubscribe here</a>.
      </p>
    </div>
  `;
  }

  // Send in batches of 10 to respect Resend rate limits (~100 req/sec)
  let sent = 0;
  let failed = 0;
  const emailList = Array.from(emails);
  const BATCH_SIZE = 10;

  for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
    const batch = emailList.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (email) => {
        const result = await sendEmail({
          to: email,
          subject: sanitizedSubject,
          html: buildHtml(email),
        });
        if (!result.error) sent++;
        else failed++;
      })
    );

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < emailList.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Track the send
  try {
    const { trackServerEvent } = await import("@/lib/track-server");
    await trackServerEvent("email_campaign_sent", {
      eventId: input.eventId,
      recipients: emails.size,
      sent,
      failed,
    });
  } catch (trackErr) {
    console.error("[sendCampaignEmail] Tracking failed:", trackErr);
  }

  return {
    error: null,
    sent,
    failed,
    total: emails.size,
  };
  } catch (err) {
    console.error("[sendCampaignEmail]", err);
    return { error: "Something went wrong", sent: 0 };
  }
}
