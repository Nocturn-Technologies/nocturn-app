"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// Verify user owns the event via collective membership
async function verifyEventAccess(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", userId: null };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", userId: null };

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have access to this event", userId: null };

  return { error: null, userId: user.id };
}

export interface PromoCode {
  id: string;
  event_id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  promoter_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export async function createPromoCode(input: {
  eventId: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses?: number | null;
  promoterId?: string | null;
  expiresAt?: string | null;
}) {
  const access = await verifyEventAccess(input.eventId);
  if (access.error) return { error: access.error };

  // Validate discount value bounds
  if (input.discountType === "percentage") {
    if (input.discountValue < 1 || input.discountValue > 100) {
      return { error: "Percentage discount must be between 1 and 100" };
    }
  } else if (input.discountType === "fixed") {
    if (input.discountValue <= 0) {
      return { error: "Fixed discount must be greater than 0" };
    }
  }

  const supabase = createAdminClient();

  // Check for duplicate code on this event
  const { data: existing } = await supabase
    .from("promo_codes")
    .select("id")
    .eq("event_id", input.eventId)
    .ilike("code", input.code)
    .maybeSingle();

  if (existing) {
    return { error: "A promo code with this name already exists for this event" };
  }

  const { error } = await supabase.from("promo_codes").insert({
    event_id: input.eventId,
    code: input.code.toUpperCase().trim(),
    discount_type: input.discountType,
    discount_value: input.discountValue,
    max_uses: input.maxUses ?? null,
    current_uses: 0,
    promoter_id: input.promoterId ?? null,
    expires_at: input.expiresAt ?? null,
    is_active: true,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function getPromoCodes(eventId: string): Promise<PromoCode[]> {
  const access = await verifyEventAccess(eventId);
  if (access.error) return [];

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[promo-codes] Failed to fetch:", error);
    return [];
  }

  return (data ?? []) as PromoCode[];
}

export async function validatePromoCode(eventId: string, code: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("event_id", eventId)
    .ilike("code", code.trim())
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, error: "Invalid promo code", discount: null };
  }

  const promo = data as PromoCode;

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { valid: false, error: "This promo code has expired", discount: null };
  }

  // Check usage limit
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    return { valid: false, error: "This promo code has reached its usage limit", discount: null };
  }

  return {
    valid: true,
    error: null,
    discount: {
      code: promo.code,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
    },
  };
}

export async function applyPromoCode(codeId: string, quantity: number = 1) {
  const supabase_auth = await createServerClient();
  const { data: { user } } = await supabase_auth.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  // Truly atomic: use RPC or a single conditional update without reading first.
  // We increment current_uses by quantity and use .lte() on the PRE-update value
  // to ensure we don't exceed max_uses. This avoids the read-then-write race.

  // First, try the atomic increment via raw update with a capacity guard.
  // The .lte() filter checks current_uses BEFORE the update is applied,
  // so we check that current_uses + quantity <= max_uses.
  const { data: promo } = await supabase
    .from("promo_codes")
    .select("id, current_uses, max_uses")
    .eq("id", codeId)
    .maybeSingle();

  if (!promo) return { error: "Promo code not found" };

  // Build atomic update: set current_uses = current_uses + quantity
  // Guard: only update if current row's current_uses <= max_uses - quantity
  const newUses = (promo.current_uses ?? 0) + quantity;

  let updateQuery = supabase
    .from("promo_codes")
    .update({ current_uses: newUses })
    .eq("id", codeId)
    .eq("current_uses", promo.current_uses ?? 0); // Optimistic lock: only update if value hasn't changed

  // Also enforce max_uses cap
  if (promo.max_uses !== null) {
    updateQuery = updateQuery.lte("current_uses", promo.max_uses - quantity);
  }

  const { data: result, error: updateError } = await updateQuery.select("id");

  if (updateError) return { error: updateError.message };
  if (!result || result.length === 0) return { error: "Promo code has reached its usage limit" };

  return { error: null };
}

export async function togglePromoCode(codeId: string, isActive: boolean) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Look up the promo code's event, then verify collective membership
  const { data: promo } = await admin
    .from("promo_codes")
    .select("event_id")
    .eq("id", codeId)
    .maybeSingle();

  if (!promo) return { error: "Promo code not found" };

  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", promo.event_id)
    .maybeSingle();

  if (!event) return { error: "Event not found" };

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have access to this event" };

  const { error } = await admin
    .from("promo_codes")
    .update({ is_active: isActive })
    .eq("id", codeId);

  if (error) return { error: error.message };
  return { error: null };
}
