"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

// ── Types ──

export interface EventUpdate {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
  email_sent: boolean;
  recipient_count: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Post an update (collective members only) ──
// Updates are stored in event_activity with action="update" and
// metadata carrying { email_sent, recipient_count }.

export async function postEventUpdate(
  eventId: string,
  body: string,
  options: { sendEmail: boolean }
): Promise<{ error: string | null; updateId: string | null }> {
  try {
    if (!eventId?.trim() || !UUID_RE.test(eventId)) {
      return { error: "Invalid event ID", updateId: null };
    }
    if (typeof body !== "string") return { error: "Invalid message", updateId: null };
    const trimmed = body.trim();
    if (trimmed.length === 0) return { error: "Message is required", updateId: null };
    if (trimmed.length > 2000) return { error: "Message must be under 2,000 characters", updateId: null };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", updateId: null };

    // Rate limit: 10 posts / hour / user
    const { success: rlOk } = await rateLimitStrict(`event-update:${user.id}`, 10, 60 * 60 * 1000);
    if (!rlOk) return { error: "Too many posts. Please wait before posting again.", updateId: null };

    const admin = createAdminClient();

    // Verify user is a member of the event's collective
    const { data: event } = await admin
      .from("events")
      .select("id, title, collective_id, slug, collectives(name, slug)")
      .eq("id", eventId)
      .maybeSingle();
    if (!event) return { error: "Event not found", updateId: null };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount || memberCount === 0) {
      return { error: "Not authorized", updateId: null };
    }

    // Insert the update into event_activity
    const { data: inserted, error } = await admin
      .from("event_activity")
      .insert({
        event_id: eventId,
        user_id: user.id,
        action: "update",
        description: trimmed,
        metadata: {
          email_sent: false,
          recipient_count: 0,
        },
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted) {
      console.error("[postEventUpdate] insert error:", error);
      return { error: "Failed to post update", updateId: null };
    }

    // Fire email (non-blocking from the caller's POV, but awaited for accuracy)
    if (options.sendEmail) {
      try {
        const collective = (event as unknown as { collectives: { name: string; slug: string } | null }).collectives;
        await sendUpdateEmails({
          updateId: inserted.id,
          eventId,
          eventTitle: event.title,
          eventSlug: event.slug ?? "",
          collectiveName: collective?.name ?? "Nocturn",
          collectiveSlug: collective?.slug ?? "",
          body: trimmed,
          authorUserId: user.id,
        });
      } catch (emailErr) {
        console.error("[postEventUpdate] email send failed:", emailErr);
        // Non-fatal: the update is still saved, admin can retry send
      }
    }

    revalidatePath(`/dashboard/events/${eventId}`);
    return { error: null, updateId: inserted.id };
  } catch (err) {
    console.error("[postEventUpdate] Unexpected:", err);
    return { error: "Something went wrong", updateId: null };
  }
}

// ── List updates (public — for event page) ──

export async function listEventUpdatesPublic(eventId: string): Promise<{
  error: string | null;
  updates: EventUpdate[];
}> {
  try {
    if (!eventId?.trim() || !UUID_RE.test(eventId)) {
      return { error: null, updates: [] };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_activity")
      .select("id, description, created_at, metadata, user_id")
      .eq("event_id", eventId)
      .eq("action", "update")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listEventUpdatesPublic]", error);
      return { error: null, updates: [] };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      description: string | null;
      created_at: string;
      metadata: Record<string, unknown> | null;
      user_id: string | null;
    }>;

    // Look up author names in a single batch query
    const authorIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))
    );
    const authorNames = new Map<string, string | null>();
    if (authorIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name")
        .in("id", authorIds);
      for (const u of users ?? []) {
        authorNames.set(u.id, u.full_name ?? null);
      }
    }

    return {
      error: null,
      updates: rows.map((r) => ({
        id: r.id,
        body: r.description ?? "",
        author_name: r.user_id ? authorNames.get(r.user_id) ?? null : null,
        created_at: r.created_at,
        email_sent: (r.metadata as { email_sent?: boolean } | null)?.email_sent ?? false,
        recipient_count: (r.metadata as { recipient_count?: number } | null)?.recipient_count ?? 0,
      })),
    };
  } catch (err) {
    console.error("[listEventUpdatesPublic]", err);
    return { error: null, updates: [] };
  }
}

// ── Delete an update (author or collective admin) ──

export async function deleteEventUpdate(updateId: string): Promise<{ error: string | null }> {
  try {
    if (!updateId?.trim() || !UUID_RE.test(updateId)) return { error: "Invalid update ID" };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("event_activity")
      .select("user_id, event_id")
      .eq("id", updateId)
      .eq("action", "update")
      .maybeSingle();
    if (!row) return { error: "Update not found" };

    if (row.user_id !== user.id) {
      // Allow collective admins to delete too
      const { data: event } = await admin
        .from("events")
        .select("collective_id")
        .eq("id", row.event_id)
        .maybeSingle();
      if (!event) return { error: "Event not found" };

      const { data: member } = await admin
        .from("collective_members")
        .select("role")
        .eq("collective_id", event.collective_id)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!member || !["owner", "admin"].includes(member.role)) {
        return { error: "Not authorized" };
      }
    }

    const { error } = await admin.from("event_activity").delete().eq("id", updateId);
    if (error) return { error: "Failed to delete update" };

    revalidatePath(`/dashboard/events/${row.event_id}`);
    return { error: null };
  } catch (err) {
    console.error("[deleteEventUpdate]", err);
    return { error: "Something went wrong" };
  }
}

// ── Internal: send update emails to all ticket holders ──

interface SendUpdateEmailsInput {
  updateId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  collectiveName: string;
  collectiveSlug: string;
  body: string;
  authorUserId: string;
}

async function sendUpdateEmails(input: SendUpdateEmailsInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendUpdateEmails] RESEND_API_KEY missing, skipping send");
    return;
  }

  const admin = createAdminClient();

  const emails = new Set<string>();

  // Resolve collective_id for this event to look up attendee_profiles
  const { data: eventMeta } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", input.eventId)
    .maybeSingle();

  // Collect recipient emails from attendee_profiles — populated at purchase time
  if (eventMeta?.collective_id) {
    const { data: attendeeRows } = await admin
      .from("attendee_profiles")
      .select("email")
      .eq("collective_id", eventMeta.collective_id);

    for (const row of (attendeeRows ?? []) as Array<{ email: string | null }>) {
      const addr = (row.email ?? "").trim().toLowerCase();
      if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) emails.add(addr);
    }
  }

  // Also collect from ticket holders via party_contact_methods
  const { data: ticketRows } = await admin
    .from("tickets")
    .select("holder_party_id")
    .eq("event_id", input.eventId)
    .in("status", ["paid", "checked_in", "free"]);

  const partyIds = Array.from(
    new Set(
      (ticketRows ?? [])
        .map((t: { holder_party_id: string | null }) => t.holder_party_id)
        .filter((id): id is string => !!id)
    )
  );

  if (partyIds.length > 0) {
    const { data: contactRows } = await admin
      .from("party_contact_methods")
      .select("value")
      .in("party_id", partyIds)
      .eq("type", "email");

    for (const row of (contactRows ?? []) as Array<{ value: string }>) {
      const addr = (row.value ?? "").trim().toLowerCase();
      if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) emails.add(addr);
    }
  }

  const recipients = Array.from(emails);
  if (recipients.length === 0) {
    await admin
      .from("event_activity")
      .update({ metadata: { email_sent: true, emailed_at: new Date().toISOString(), recipient_count: 0 } })
      .eq("id", input.updateId);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const eventUrl = `${appUrl}/e/${input.collectiveSlug}/${input.eventSlug}`;
  const safeBody = escapeHtml(input.body).replace(/\n/g, "<br/>");
  const safeTitle = escapeHtml(input.eventTitle);
  const safeCollective = escapeHtml(input.collectiveName);

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #09090B; color: #FAFAFA;">
      <div style="margin-bottom: 24px;">
        <span style="color: #7B2FF7; font-weight: 700; font-size: 20px;">nocturn.</span>
      </div>
      <p style="color: #71717A; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px;">
        Update from ${safeCollective}
      </p>
      <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 20px; line-height: 1.3;">
        ${safeTitle}
      </h1>
      <div style="background: #18181B; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; margin-bottom: 24px; color: #E4E4E7; font-size: 15px; line-height: 1.6;">
        ${safeBody}
      </div>
      <a href="${eventUrl}" style="display: inline-block; background: #7B2FF7; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View event
      </a>
      <p style="color: #52525B; font-size: 11px; margin-top: 32px; line-height: 1.5;">
        You&apos;re getting this because you have a ticket to this event on Nocturn.
      </p>
    </div>
  `;

  // Send in batches of 50 (Resend batch limit)
  let sent = 0;
  const BATCH = 50;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          batch.map((to) => ({
            from: "Nocturn <updates@trynocturn.com>",
            to,
            subject: `Update: ${input.eventTitle}`,
            html,
          }))
        ),
      });
      if (res.ok) {
        sent += batch.length;
      } else {
        const txt = await res.text();
        console.error("[sendUpdateEmails] batch failed:", res.status, txt);
      }
    } catch (err) {
      console.error("[sendUpdateEmails] fetch error:", err);
    }
  }

  await admin
    .from("event_activity")
    .update({
      metadata: {
        email_sent: sent > 0,
        emailed_at: new Date().toISOString(),
        recipient_count: sent,
      },
    })
    .eq("id", input.updateId);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
