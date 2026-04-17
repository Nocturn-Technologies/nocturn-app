"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/utils";

// Verify user owns the event via collective membership
async function verifyEventAccess(eventId: string) {
  if (!isValidUUID(eventId)) return { error: "Invalid event ID", userId: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", userId: null };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .is("deleted_at", null)
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
  event_id: string | null;
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  max_uses: number | null;
  current_uses: number | null;
  promoter_id: string;
  collective_id: string;
  valid_from: string | null;
  valid_until: string | null;
  /** Virtual field computed from valid_until — true if valid_until is null or in the future */
  is_active: boolean;
  /** Alias for valid_until, for backward compat with UI */
  expires_at: string | null;
  created_at: string;
}

/** Map a raw promo_codes DB row to a PromoCode with computed fields */
function toPromoCode(row: Record<string, unknown>): PromoCode {
  const validUntil = row.valid_until as string | null;
  const isActive =
    validUntil === null || new Date(validUntil) > new Date();
  return {
    id: row.id as string,
    event_id: (row.event_id as string | null) ?? null,
    code: row.code as string,
    discount_type: (row.discount_type as string | null) ?? null,
    discount_value: (row.discount_value as number | null) ?? null,
    max_uses: (row.max_uses as number | null) ?? null,
    current_uses: (row.current_uses as number | null) ?? null,
    promoter_id: row.promoter_id as string,
    collective_id: row.collective_id as string,
    valid_from: (row.valid_from as string | null) ?? null,
    valid_until: validUntil,
    is_active: isActive,
    expires_at: validUntil,
    created_at: row.created_at as string,
  };
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
  try {
    if (!input.eventId?.trim() || !input.code?.trim()) {
      return { error: "Event ID and promo code are required" };
    }

    const access = await verifyEventAccess(input.eventId);
    if (access.error) return { error: access.error };
    if (input.maxUses !== null && input.maxUses !== undefined) {
      if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 100_000) {
        return { error: "maxUses must be an integer between 1 and 100,000" };
      }
    }
    if (input.expiresAt !== null && input.expiresAt !== undefined) {
      if (isNaN(Date.parse(input.expiresAt))) {
        return { error: "expiresAt must be a valid ISO date" };
      }
      const expiresDate = new Date(input.expiresAt);
      const now = new Date();
      const twoYearsOut = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
      if (expiresDate <= now) {
        return { error: "expiresAt must be in the future" };
      }
      if (expiresDate > twoYearsOut) {
        return { error: "expiresAt cannot be more than 2 years in the future" };
      }
    }

    // Rate limit: 10 promo code operations per minute per user
    const { success: rlOk } = await rateLimitStrict(`promo:${access.userId}`, 10, 60_000);
    if (!rlOk) return { error: "Too many requests. Please wait a moment." };

    // Validate discount value bounds
    if (!Number.isFinite(input.discountValue)) {
      return { error: "Discount value must be a finite number" };
    }
    if (input.discountType === "percentage") {
      if (input.discountValue <= 0 || input.discountValue > 100) {
        return { error: "Percentage discount must be between 1 and 100" };
      }
    } else if (input.discountType === "fixed") {
      if (input.discountValue <= 0) {
        return { error: "Fixed discount must be greater than 0" };
      }
    }

    const supabase = createAdminClient();

    if (!/^[A-Z0-9_-]+$/i.test(input.code.trim()) || input.code.trim().length > 50) {
      return { error: "Promo code must be alphanumeric and under 50 characters" };
    }

    // Look up the event's collective_id for the required FK
    const { data: eventRow } = await supabase
      .from("events")
      .select("collective_id")
      .eq("id", input.eventId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!eventRow) return { error: "Event not found" };

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
      collective_id: eventRow.collective_id,
      promoter_id: input.promoterId ?? access.userId!,
      valid_until: input.expiresAt ?? null,
    });

    if (error) return { error: "Failed to create promo code" };
    return { error: null };
  } catch (err) {
    console.error("[createPromoCode]", err);
    return { error: "Something went wrong" };
  }
}

export async function getPromoCodes(eventId: string): Promise<PromoCode[]> {
  try {
    if (!eventId?.trim()) return [];

    const access = await verifyEventAccess(eventId);
    if (access.error) return [];

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getPromoCodes]", error);
      return [];
    }

    return (data ?? []).map((row) => toPromoCode(row as unknown as Record<string, unknown>));
  } catch (err) {
    console.error("[getPromoCodes]", err);
    return [];
  }
}

export async function validatePromoCode(eventId: string, code: string) {
  try {
    if (!eventId?.trim() || !code?.trim()) {
      return { valid: false, error: "Invalid promo code", discount: null };
    }
    if (!isValidUUID(eventId)) {
      return { valid: false, error: "Invalid event ID format", discount: null };
    }
    if (code.trim().length > 50 || !/^[A-Z0-9_-]+$/i.test(code.trim())) {
      return { valid: false, error: "Invalid promo code format", discount: null };
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("event_id", eventId)
      .ilike("code", code.trim())
      .maybeSingle();

    if (error || !data) {
      return { valid: false, error: "Invalid promo code", discount: null };
    }

    const promo = toPromoCode(data as unknown as Record<string, unknown>);

    // Check if deactivated (valid_until in the past)
    if (!promo.is_active) {
      return { valid: false, error: "This promo code is no longer active", discount: null };
    }

    // Check expiry
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return { valid: false, error: "This promo code has expired", discount: null };
    }

    // Check usage limit
    if (promo.max_uses !== null && (promo.current_uses ?? 0) >= promo.max_uses) {
      return { valid: false, error: "This promo code has reached its usage limit", discount: null };
    }

    return {
      valid: true,
      error: null,
      discount: {
        code: promo.code,
        discountType: promo.discount_type ?? "percentage",
        discountValue: promo.discount_value ?? 0,
      },
    };
  } catch (err) {
    console.error("[validatePromoCode]", err);
    return { valid: false, error: "Something went wrong", discount: null };
  }
}

export async function togglePromoCode(codeId: string, isActive: boolean) {
  try {
    if (!codeId?.trim()) return { error: "Promo code ID is required" };
    if (!isValidUUID(codeId)) return { error: "Invalid promo code ID format" };

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
    if (!promo.event_id) return { error: "Promo code has no associated event" };

    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", promo.event_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!event) return { error: "Event not found" };

    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count || count === 0) return { error: "You don't have access to this event" };

    // The DB has no is_active column — use valid_until to control activation.
    // Deactivate = set valid_until to now (past date). Reactivate = set to null (no expiry).
    const { error } = await admin
      .from("promo_codes")
      .update({ valid_until: isActive ? null : new Date().toISOString() })
      .eq("id", codeId);

    if (error) return { error: "Failed to update promo code" };
    return { error: null };
  } catch (err) {
    console.error("[togglePromoCode]", err);
    return { error: "Something went wrong" };
  }
}
