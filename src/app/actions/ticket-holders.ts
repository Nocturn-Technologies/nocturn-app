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
 * Fetch ticket holders for a ticketed event.
 *
 * New schema path for buyer identity:
 *   tickets.holder_party_id → parties.display_name
 *   tickets.order_line_id → order_lines.unit_price + order_lines.order_id
 *   order_lines.order_id → orders.party_id + orders.currency + orders.metadata
 *   orders.party_id → parties.display_name (buyer name)
 *   party_contact_methods (type='email', party_id = orders.party_id) for email
 *
 * `checked_in_at` is no longer a column on tickets — returned as null.
 * `currency` comes from the parent order.
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

    // Fetch tickets with tier name, order_line (for price), and holder party
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select(
        `id, status, qr_code, created_at, issued_at, holder_party_id,
         ticket_tiers ( name ),
         order_lines ( unit_price, order_id )`,
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("[listEventTicketHolders] query error:", ticketsError.message);
      return { error: "Failed to load ticket holders", holders: [] };
    }

    if (!tickets || tickets.length === 0) {
      return { error: null, holders: [] };
    }

    // Collect unique order_ids and party_ids for batch lookups
    type OrderLineRow = { unit_price: number; order_id: string } | null;

    const orderIds = Array.from(
      new Set(
        (tickets ?? [])
          .map((t) => {
            const ol = t.order_lines as unknown as OrderLineRow;
            return ol?.order_id ?? null;
          })
          .filter((id): id is string => !!id)
      )
    );

    const holderPartyIds = Array.from(
      new Set(
        (tickets ?? [])
          .map((t) => t.holder_party_id)
          .filter((id): id is string => !!id)
      )
    );

    // Batch fetch orders (for currency and buyer party_id)
    type OrderRow = { id: string; party_id: string; currency: string; metadata: Record<string, unknown> | null };
    const orderMap = new Map<string, OrderRow>();
    if (orderIds.length > 0) {
      const { data: orders } = await admin
        .from("orders")
        .select("id, party_id, currency, metadata")
        .in("id", orderIds);
      for (const o of (orders ?? []) as OrderRow[]) {
        orderMap.set(o.id, o);
      }
    }

    // Collect all party_ids we need (buyer parties + holder parties)
    const buyerPartyIds = Array.from(
      new Set(Array.from(orderMap.values()).map((o) => o.party_id).filter(Boolean))
    );
    const allPartyIds = Array.from(new Set([...holderPartyIds, ...buyerPartyIds]));

    // Batch fetch party display names
    type PartyRow = { id: string; display_name: string };
    const partyMap = new Map<string, PartyRow>();
    if (allPartyIds.length > 0) {
      const { data: parties } = await admin
        .from("parties")
        .select("id, display_name")
        .in("id", allPartyIds);
      for (const p of (parties ?? []) as PartyRow[]) {
        partyMap.set(p.id, p);
      }
    }

    // Batch fetch primary email contact methods for buyer parties
    type ContactRow = { party_id: string; value: string };
    const emailMap = new Map<string, string>();
    if (buyerPartyIds.length > 0) {
      const { data: contacts } = await admin
        .from("party_contact_methods")
        .select("party_id, value")
        .in("party_id", buyerPartyIds)
        .eq("type", "email")
        .eq("is_primary", true);
      for (const c of (contacts ?? []) as ContactRow[]) {
        emailMap.set(c.party_id, c.value);
      }
    }

    const holders: TicketHolder[] = (tickets ?? []).map((t) => {
      const tierRow = t.ticket_tiers as unknown as { name: string | null } | null;
      const orderLine = t.order_lines as unknown as OrderLineRow;
      const order = orderLine?.order_id ? orderMap.get(orderLine.order_id) : null;

      const buyerPartyId = order?.party_id ?? null;
      const holderParty = t.holder_party_id ? partyMap.get(t.holder_party_id) : null;
      const buyerParty = buyerPartyId ? partyMap.get(buyerPartyId) : null;

      // Prefer holder party name, fall back to buyer party name, then order metadata
      const orderMeta = (order?.metadata ?? {}) as {
        buyer_name?: string;
        customer_name?: string;
        buyer_email?: string;
        customer_email?: string;
      };

      const full_name =
        holderParty?.display_name ??
        buyerParty?.display_name ??
        orderMeta.buyer_name ??
        orderMeta.customer_name ??
        null;

      const email =
        (buyerPartyId ? emailMap.get(buyerPartyId) : null) ??
        orderMeta.buyer_email ??
        orderMeta.customer_email ??
        null;

      return {
        id: t.id,
        status: t.status as TicketHolderStatus,
        full_name,
        email: email ?? null,
        tier_name: tierRow?.name ?? null,
        price_paid: Number(orderLine?.unit_price) || 0,
        currency: (order?.currency ?? "usd").toLowerCase(),
        checked_in_at: null, // column removed in schema rebuild
        created_at: t.created_at,
      };
    });

    return { error: null, holders };
  } catch (err) {
    console.error("[listEventTicketHolders]", err);
    return { error: "Something went wrong", holders: [] };
  }
}
