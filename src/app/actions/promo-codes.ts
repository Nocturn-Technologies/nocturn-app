"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

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
  try {
    if (!input.eventId?.trim() || !input.code?.trim()) {
      return { error: "Event ID and promo code are required" };
    }

    const access = await verifyEventAccess(input.eventId);
    if (access.error) return { error: access.error };

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

    return (data ?? []) as PromoCode[];
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
  } catch (err) {
    console.error("[validatePromoCode]", err);
    return { valid: false, error: "Something went wrong", discount: null };
  }
}

export async function togglePromoCode(codeId: string, isActive: boolean) {
  try {
    if (!codeId?.trim()) return { error: "Promo code ID is required" };

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

    const { error } = await admin
      .from("promo_codes")
      .update({ is_active: isActive })
      .eq("id", codeId);

    if (error) return { error: "Failed to update promo code" };
    return { error: null };
  } catch (err) {
    console.error("[togglePromoCode]", err);
    return { error: "Something went wrong" };
  }
}
