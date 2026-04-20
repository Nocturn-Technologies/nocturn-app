"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/utils";
import { verifyEventOwnership } from "@/lib/auth/ownership";

// Thin wrapper over the shared ownership helper — preserves the original
// `{ error, userId }` return shape so call sites don't have to change.
// UUID validation up-front keeps callers from hitting the DB with junk.
async function verifyEventAccess(eventId: string) {
  if (!isValidUUID(eventId)) return { error: "Invalid event ID", userId: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", userId: null };

  const ok = await verifyEventOwnership(user.id, eventId);
  if (!ok) return { error: "You don't have access to this event", userId: null };

  return { error: null, userId: user.id };
}

export interface PromoCode {
  id: string;
  event_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  /** true if is_active=true and not past expires_at */
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Map a raw promo_codes DB row + usage count to a PromoCode */
function toPromoCode(row: Record<string, unknown>, usageCount: number): PromoCode {
  const expiresAt = row.expires_at as string | null;
  const isActiveDb = row.is_active as boolean;
  const isActive =
    isActiveDb &&
    (expiresAt === null || new Date(expiresAt) > new Date());
  return {
    id: row.id as string,
    event_id: row.event_id as string,
    code: row.code as string,
    discount_type: row.discount_type as string,
    discount_value: row.discount_value as number,
    max_uses: (row.max_uses as number | null) ?? null,
    current_uses: usageCount,
    is_active: isActive,
    starts_at: (row.starts_at as string | null) ?? null,
    expires_at: expiresAt,
    created_at: row.created_at as string,
  };
}

export async function createPromoCode(input: {
  eventId: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  startsAt?: string | null;
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

    // Status guard in one query. Creating promo codes on completed/archived events
    // doesn't make sense and could confuse settlement reconciliation.
    const { data: eventRow } = await supabase
      .from("events")
      .select("status, collective_id")
      .eq("id", input.eventId)
      .maybeSingle();

    if (!eventRow) return { error: "Event not found" };
    if (eventRow.status !== "draft" && eventRow.status !== "published") {
      return { error: "Can't create promo codes for a completed or archived event." };
    }

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
      expires_at: input.expiresAt ?? null,
      starts_at: input.startsAt ?? null,
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

    if (!data || data.length === 0) return [];

    // Fetch usage counts for all promo codes in one query
    const codeIds = data.map((r) => r.id);
    const { data: usageRows } = await supabase
      .from("promo_code_usage")
      .select("promo_code_id")
      .in("promo_code_id", codeIds);

    const usageCounts: Record<string, number> = {};
    for (const row of usageRows ?? []) {
      usageCounts[row.promo_code_id] = (usageCounts[row.promo_code_id] ?? 0) + 1;
    }

    return data.map((row) =>
      toPromoCode(row as unknown as Record<string, unknown>, usageCounts[row.id] ?? 0)
    );
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

    // Check is_active flag
    if (!data.is_active) {
      return { valid: false, error: "This promo code is no longer active", discount: null };
    }

    // Check starts_at — not yet valid
    if (data.starts_at && new Date(data.starts_at) > new Date()) {
      return { valid: false, error: "This promo code is not yet active", discount: null };
    }

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, error: "This promo code has expired", discount: null };
    }

    // Check usage limit — count rows in promo_code_usage
    if (data.max_uses !== null) {
      const { count: usageCount } = await supabase
        .from("promo_code_usage")
        .select("*", { count: "exact", head: true })
        .eq("promo_code_id", data.id);

      if ((usageCount ?? 0) >= data.max_uses) {
        return { valid: false, error: "This promo code has reached its usage limit", discount: null };
      }
    }

    return {
      valid: true,
      error: null,
      discount: {
        code: data.code,
        discountType: data.discount_type,
        discountValue: data.discount_value,
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

    // Toggle is_active directly — new schema has a real is_active column
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
