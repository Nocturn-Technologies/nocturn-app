"use server";

import { createAdminClient } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";
import { randomUUID, randomBytes } from "crypto";
import QRCode from "qrcode";
import { calculateServiceFeeCents } from "@/lib/pricing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
const BUY_LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Shared auth: caller must be an active member of the event's collective.
 * Returns { collectiveId, userId } on success or { error } on failure.
 */
async function verifyDoorAccess(eventId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" as const };

    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();

    if (eventError || !event) return { error: "Event not found" as const };

    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count || count === 0) return { error: "You don't have access to this event" as const };

    return { collectiveId: event.collective_id as string, userId: user.id, error: null };
  } catch (err) {
    console.error("[door-sale] verifyDoorAccess error:", err);
    return { error: "Something went wrong" as const };
  }
}

/**
 * Look up tier price, capacity, and current sold count.
 */
async function getTierContext(admin: ReturnType<typeof createAdminClient>, eventId: string, tierId: string) {
  const [{ data: tier }, { count: soldCount }] = await Promise.all([
    admin
      .from("ticket_tiers")
      .select("id, name, price, capacity, sales_start, sales_end")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle(),
    admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("ticket_tier_id", tierId)
      .in("status", ["paid", "checked_in", "reserved", "pending"]),
  ]);

  if (!tier) return null;
  return { tier, soldCount: soldCount ?? 0 };
}

// ── Cash sale ────────────────────────────────────────────────────────

export interface CashSaleInput {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerName?: string;
}

export interface DoorSaleResult {
  success: boolean;
  error?: string;
  ticketIds?: string[];
  tokens?: string[];
  overCapacity?: boolean;
}

export async function recordCashSale(input: CashSaleInput): Promise<DoorSaleResult> {
  const { eventId, tierId, quantity } = input;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return { success: false, error: "Quantity must be between 1 and 4" };
  }

  const access = await verifyDoorAccess(eventId);
  if (access.error) return { success: false, error: access.error };

  const { success: rlOk } = await rateLimitStrict(`door-sale:${access.userId}`, 60, 60_000);
  if (!rlOk) return { success: false, error: "Too many sales. Please slow down." };

  const admin = createAdminClient();
  const ctx = await getTierContext(admin, eventId, tierId);
  if (!ctx) return { success: false, error: "Ticket tier not found" };

  const { tier, soldCount } = ctx;
  const priceNumber = Number(tier.price);
  if (!Number.isFinite(priceNumber) || priceNumber < 0) {
    return { success: false, error: "Invalid ticket price" };
  }
  const priceCents = Math.round(priceNumber * 100);

  const overCapacity = tier.capacity != null && soldCount + quantity > tier.capacity;

  // Create paid tickets — cash never touches Stripe, so no fee.
  // Auto-check-in at creation: buyer is standing at the door.
  const now = new Date().toISOString();
  const newTickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null,
    status: "checked_in" as const,
    checked_in_at: now,
    price_paid: priceNumber,
    currency: "usd",
    stripe_payment_intent_id: null,
    ticket_token: randomUUID(),
    metadata: {
      registration_type: "door_cash",
      sold_by: access.userId,
      ...(input.buyerEmail && { customer_email: input.buyerEmail.trim().toLowerCase() }),
      ...(input.buyerPhone && { customer_phone: input.buyerPhone.trim() }),
      ...(input.buyerName && { customer_name: input.buyerName.trim() }),
    },
  }));

  const { data: inserted, error: insertError } = await admin
    .from("tickets")
    .insert(newTickets)
    .select("id, ticket_token");

  if (insertError || !inserted) {
    console.error("[door-sale] cash insert failed:", insertError);
    return { success: false, error: "Failed to create ticket" };
  }

  // Audit row — one per sale batch (quantity captured on the row)
  await admin.from("door_events").insert({
    event_id: eventId,
    collective_id: access.collectiveId,
    staff_user_id: access.userId,
    ticket_id: inserted[0]?.id ?? null,
    tier_id: tierId,
    action: "sale_cash",
    payment_method: "cash",
    quantity,
    amount_cents: priceCents * quantity,
    currency: "usd",
    reason: null,
    buyer_email: input.buyerEmail?.trim().toLowerCase() ?? null,
    buyer_phone: input.buyerPhone?.trim() ?? null,
    over_capacity: overCapacity,
  });

  if (overCapacity) {
    await admin.from("door_events").insert({
      event_id: eventId,
      collective_id: access.collectiveId,
      staff_user_id: access.userId,
      ticket_id: inserted[0]?.id ?? null,
      tier_id: tierId,
      action: "capacity_override",
      payment_method: "cash",
      quantity,
      amount_cents: priceCents * quantity,
      currency: "usd",
      reason: "cash sale past tier capacity",
      over_capacity: true,
    });
  }

  return {
    success: true,
    ticketIds: inserted.map((t) => t.id),
    tokens: inserted.map((t) => t.ticket_token),
    overCapacity,
  };
}

// ── Comp sale ────────────────────────────────────────────────────────

export interface CompSaleInput {
  eventId: string;
  tierId: string;
  quantity: number;
  reason: string;
  buyerEmail?: string;
  buyerName?: string;
}

export async function recordCompSale(input: CompSaleInput): Promise<DoorSaleResult> {
  const { eventId, tierId, quantity, reason } = input;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return { success: false, error: "Quantity must be between 1 and 4" };
  }
  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < 3 || trimmedReason.length > 120) {
    return { success: false, error: "Comp reason is required (3-120 characters)" };
  }

  const access = await verifyDoorAccess(eventId);
  if (access.error) return { success: false, error: access.error };

  const { success: rlOk } = await rateLimitStrict(`door-sale:${access.userId}`, 60, 60_000);
  if (!rlOk) return { success: false, error: "Too many sales. Please slow down." };

  const admin = createAdminClient();
  const ctx = await getTierContext(admin, eventId, tierId);
  if (!ctx) return { success: false, error: "Ticket tier not found" };

  const { tier, soldCount } = ctx;
  const overCapacity = tier.capacity != null && soldCount + quantity > tier.capacity;

  const now = new Date().toISOString();
  const newTickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null,
    status: "checked_in" as const,
    checked_in_at: now,
    price_paid: 0,
    currency: "usd",
    stripe_payment_intent_id: null,
    ticket_token: randomUUID(),
    metadata: {
      registration_type: "door_comp",
      sold_by: access.userId,
      comp_reason: trimmedReason,
      ...(input.buyerEmail && { customer_email: input.buyerEmail.trim().toLowerCase() }),
      ...(input.buyerName && { customer_name: input.buyerName.trim() }),
    },
  }));

  const { data: inserted, error: insertError } = await admin
    .from("tickets")
    .insert(newTickets)
    .select("id, ticket_token");

  if (insertError || !inserted) {
    console.error("[door-sale] comp insert failed:", insertError);
    return { success: false, error: "Failed to create comp ticket" };
  }

  await admin.from("door_events").insert({
    event_id: eventId,
    collective_id: access.collectiveId,
    staff_user_id: access.userId,
    ticket_id: inserted[0]?.id ?? null,
    tier_id: tierId,
    action: "sale_comp",
    payment_method: "comp",
    quantity,
    amount_cents: 0,
    currency: "usd",
    reason: trimmedReason,
    buyer_email: input.buyerEmail?.trim().toLowerCase() ?? null,
    over_capacity: overCapacity,
  });

  return {
    success: true,
    ticketIds: inserted.map((t) => t.id),
    tokens: inserted.map((t) => t.ticket_token),
    overCapacity,
  };
}

// ── Void (5-min undo for mis-sales) ──────────────────────────────────

export async function voidDoorSale(ticketId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  if (!ticketId) return { success: false, error: "Ticket ID required" };
  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < 3 || trimmedReason.length > 120) {
    return { success: false, error: "Void reason is required (3-120 characters)" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("id, event_id, created_at, status, metadata")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return { success: false, error: "Ticket not found" };

  const access = await verifyDoorAccess(ticket.event_id);
  if (access.error) return { success: false, error: access.error };

  const meta = ticket.metadata as Record<string, unknown> | null;
  const soldBy = meta?.sold_by as string | undefined;
  if (soldBy !== user.id) {
    return { success: false, error: "Only the staff member who sold this can void it" };
  }

  const ageMs = Date.now() - new Date(ticket.created_at as string).getTime();
  if (ageMs > 5 * 60 * 1000) {
    return { success: false, error: "Void window (5 min) expired. Use the refunds page." };
  }

  const { error: updateError } = await admin
    .from("tickets")
    .update({ status: "refunded" })
    .eq("id", ticket.id);

  if (updateError) {
    console.error("[door-sale] void update failed:", updateError);
    return { success: false, error: "Failed to void ticket" };
  }

  await admin.from("door_events").insert({
    event_id: ticket.event_id,
    collective_id: access.collectiveId,
    staff_user_id: access.userId,
    ticket_id: ticket.id,
    action: "void",
    payment_method: null,
    quantity: 1,
    amount_cents: 0,
    currency: "usd",
    reason: trimmedReason,
  });

  return { success: true };
}

// ── Reconciliation (live totals for scanner widget) ──────────────────

export interface DoorReconciliation {
  cardCount: number;
  cardCents: number;
  cashCount: number;
  cashCents: number;
  compCount: number;
  voidCount: number;
  overCapacityCount: number;
  byStaff: {
    staffUserId: string;
    name: string;
    cashCents: number;
    cashCount: number;
    compCount: number;
    cardCount: number;
  }[];
}

export async function getDoorReconciliation(eventId: string): Promise<DoorReconciliation | null> {
  const access = await verifyDoorAccess(eventId);
  if (access.error) return null;

  const admin = createAdminClient();

  const [{ data: summary }, { data: rows }] = await Promise.all([
    admin
      .from("door_sale_summary")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle(),
    admin
      .from("door_events")
      .select("staff_user_id, action, payment_method, amount_cents, quantity")
      .eq("event_id", eventId),
  ]);

  const byStaffMap = new Map<string, { cashCents: number; cashCount: number; compCount: number; cardCount: number }>();
  for (const r of rows ?? []) {
    const existing = byStaffMap.get(r.staff_user_id) ?? { cashCents: 0, cashCount: 0, compCount: 0, cardCount: 0 };
    if (r.action === "sale_cash") {
      existing.cashCents += r.amount_cents ?? 0;
      existing.cashCount += r.quantity ?? 1;
    } else if (r.action === "sale_comp") {
      existing.compCount += r.quantity ?? 1;
    } else if (r.action === "sale_card") {
      existing.cardCount += r.quantity ?? 1;
    }
    byStaffMap.set(r.staff_user_id, existing);
  }

  const staffIds = Array.from(byStaffMap.keys());
  const { data: users } = staffIds.length
    ? await admin.from("users").select("id, full_name, email").in("id", staffIds)
    : { data: [] };

  const byStaff = Array.from(byStaffMap.entries()).map(([staffUserId, stats]) => {
    const u = users?.find((u) => u.id === staffUserId);
    return {
      staffUserId,
      name: u?.full_name || u?.email || "Staff",
      ...stats,
    };
  });

  return {
    cardCount: summary?.card_count ?? 0,
    cardCents: summary?.card_cents ?? 0,
    cashCount: summary?.cash_count ?? 0,
    cashCents: summary?.cash_cents ?? 0,
    compCount: summary?.comp_count ?? 0,
    voidCount: summary?.void_count ?? 0,
    overCapacityCount: summary?.over_capacity_count ?? 0,
    byStaff,
  };
}

// ── Mint buy link (signed QR for card path) ──────────────────────────

export interface BuyLinkResult {
  success: boolean;
  error?: string;
  url?: string;
  qrDataUrl?: string;
  nonce?: string;
  expiresAt?: string;
  tierName?: string;
  priceCents?: number;
  serviceFeeCents?: number;
  totalCents?: number;
}

export async function generateDoorBuyLink(opts: {
  eventId: string;
  tierId: string;
  quantity: number;
}): Promise<BuyLinkResult> {
  const { eventId, tierId, quantity } = opts;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return { success: false, error: "Quantity must be between 1 and 4" };
  }

  const access = await verifyDoorAccess(eventId);
  if (access.error) return { success: false, error: access.error };

  const { success: rlOk } = await rateLimitStrict(`door-link:${access.userId}`, 30, 60_000);
  if (!rlOk) return { success: false, error: "Too many links. Please wait a moment." };

  const admin = createAdminClient();
  const ctx = await getTierContext(admin, eventId, tierId);
  if (!ctx) return { success: false, error: "Ticket tier not found" };

  const { tier } = ctx;
  const priceCents = Math.round(Number(tier.price) * 100);
  const serviceFeePerTicket = calculateServiceFeeCents(priceCents);
  const totalCents = (priceCents + serviceFeePerTicket) * quantity;

  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + BUY_LINK_TTL_MS).toISOString();

  const { error: insertError } = await admin.from("door_buy_tokens").insert({
    nonce,
    event_id: eventId,
    tier_id: tierId,
    staff_user_id: access.userId,
    quantity,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("[door-sale] buy-link insert failed:", insertError);
    return { success: false, error: "Failed to create payment link" };
  }

  const url = `${APP_URL}/door-buy/${nonce}`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 640,
    margin: 2,
    color: { dark: "#09090B", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });

  return {
    success: true,
    url,
    qrDataUrl,
    nonce,
    expiresAt,
    tierName: tier.name,
    priceCents,
    serviceFeeCents: serviceFeePerTicket,
    totalCents,
  };
}
