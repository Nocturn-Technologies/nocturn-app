"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Send "Thanks for coming" recap email to all attendees after an event completes.
 */
export async function sendRecapEmails(eventId: string): Promise<{ error: string | null; sent: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "Email not configured", sent: 0 };

  const admin = createAdminClient();

  // Get event details
  const { data: event } = await admin
    .from("events")
    .select("title, starts_at, collectives(name)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", sent: 0 };

  const collective = event.collectives as unknown as { name: string } | null;
  const collectiveName = collective?.name ?? "the crew";
  const eventDate = new Date(event.starts_at).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Get all checked-in attendees with emails
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, metadata, user_id")
    .eq("event_id", eventId)
    .not("checked_in_at", "is", null);

  if (!tickets || tickets.length === 0) return { error: null, sent: 0 };

  // Get user emails
  const userIds = tickets.map((t) => t.user_id).filter(Boolean);
  const { data: users } = await admin
    .from("users")
    .select("id, email, full_name")
    .in("id", userIds);

  const userMap: Record<string, { email: string; name: string }> = {};
  for (const u of users ?? []) {
    userMap[u.id] = { email: u.email, name: u.full_name || u.email.split("@")[0] };
  }

  // Also get emails from ticket metadata
  const emails: Set<string> = new Set();
  const emailNames: Record<string, string> = {};

  for (const t of tickets) {
    const meta = t.metadata as Record<string, unknown> | null;
    const metaEmail = meta?.email as string | undefined;
    if (metaEmail) {
      emails.add(metaEmail);
      emailNames[metaEmail] = (meta?.name as string) ?? metaEmail.split("@")[0];
    }
    if (t.user_id && userMap[t.user_id]) {
      emails.add(userMap[t.user_id].email);
      emailNames[userMap[t.user_id].email] = userMap[t.user_id].name;
    }
  }

  let sent = 0;
  const emailList = Array.from(emails);

  // Send in batches of 10
  for (let i = 0; i < emailList.length; i += 10) {
    const batch = emailList.slice(i, i + 10);
    await Promise.all(
      batch.map(async (email) => {
        const name = emailNames[email] ?? "there";
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: `${collectiveName} via Nocturn <nocturn@trynocturn.com>`,
              to: email,
              subject: `Thanks for coming to ${event.title}`,
              html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
                  <div style="margin-bottom: 32px;">
                    <span style="color: #7B2FF7; font-weight: 700; font-size: 18px;">nocturn.</span>
                  </div>
                  <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px; line-height: 1.2;">
                    Thanks for coming, ${name.split(" ")[0]}.
                  </h1>
                  <p style="color: #71717A; font-size: 13px; margin: 0 0 24px;">
                    ${event.title} · ${eventDate}
                  </p>
                  <p style="color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    We hope you had an amazing night. ${collectiveName} puts everything into making these moments happen — and you being there is what makes it worth it.
                  </p>
                  <p style="color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 32px;">
                    Follow us to stay in the loop for the next one. And if you brought friends who loved it — tell them to get on Nocturn so they never miss out.
                  </p>
                  <a href="https://app.trynocturn.com" style="display: inline-block; background: #7B2FF7; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    See What's Next
                  </a>
                  <p style="color: #3f3f46; font-size: 11px; margin-top: 40px;">
                    Sent by ${collectiveName} via Nocturn
                  </p>
                </div>
              `,
            }),
          });
          sent++;
        } catch {
          // Skip failed emails
        }
      })
    );
  }

  return { error: null, sent };
}
