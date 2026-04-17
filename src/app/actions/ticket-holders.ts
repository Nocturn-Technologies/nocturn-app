"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ──

export type TicketHolderStatus = "paid" | "checked_in" | "refunded" | "reserved";

export interface TicketHolder {
  id: string;
  status: TicketHolderStatus;
  full_name: string | null;
  email: string | null;
  tier_name: string | null;
  price_paid: number;
  currency: string;
  checked_in_at: string | null;
  created_at: string;
}

/**
 * Fetch ticket holders for a ticketed event. Parallel to listEventRsvps but
 * backed by the `tickets` table. Buyer identity resolves from three possible
 * sources — preferring the most reliable (users table join) and falling back
 * to the Stripe checkout metadata we captured, then finally the walk-in
 * attendee_name column:
 *
 *   1. `users` row via `tickets.user_id` (registered buyers)
 *   2. `tickets.metadata.customer_email` / `buyer_email` / `email` (Stripe guest checkout)
 *   3. `tickets.attendee_name` (door comp / manual ticket)
 *
 * Returns `reserved` tickets too so operators can see in-flight Stripe
 * sessions; UI filters them out of headline counts.
 */
export async function listEventTicketHolders(eventId: string): Promise<{
  error: string | null;
  holders: TicketHolder[];
}> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", holders: [] };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", holders: [] };

    const admin = createAdminClient();

    // Ownership check: caller must be a member of the collective that owns the event.
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!event) return { error: "Event not found", holders: [] };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount) return { error: "Not authorized", holders: [] };

    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select(
        `id, status, price_paid, currency, checked_in_at, created_at, attendee_name, metadata,
         ticket_tiers ( name ),
         users!tickets_user_id_fkey ( full_name, email )`,
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("[listEventTicketHolders] query error:", ticketsError.message);
      return { error: "Failed to load ticket holders", holders: [] };
    }

    const holders: TicketHolder[] = (tickets ?? []).map((t) => {
      // Structural cast — Supabase returns single-row relations as objects, not arrays,
      // but the generated types widen to arrays. Narrow via `unknown` (not `any`).
      const userRow = t.users as unknown as { full_name: string | null; email: string | null } | null;
      const tierRow = t.ticket_tiers as unknown as { name: string | null } | null;
      const meta = (t.metadata ?? {}) as {
        customer_email?: string;
        buyer_email?: string;
        email?: string;
        buyer_name?: string;
        customer_name?: string;
      };

      const email =
        userRow?.email ??
        meta.customer_email ??
        meta.buyer_email ??
        meta.email ??
        null;

      const full_name =
        userRow?.full_name ??
        meta.customer_name ??
        meta.buyer_name ??
        t.attendee_name ??
        null;

      return {
        id: t.id,
        status: t.status as TicketHolderStatus,
        full_name,
        email,
        tier_name: tierRow?.name ?? null,
        price_paid: Number(t.price_paid) || 0,
        currency: (t.currency ?? "usd").toLowerCase(),
        checked_in_at: t.checked_in_at,
        created_at: t.created_at,
      };
    });

    return { error: null, holders };
  } catch (err) {
    console.error("[listEventTicketHolders]", err);
    return { error: "Something went wrong", holders: [] };
  }
}
