"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

async function verifyTierOwnership(userId: string, tierId: string) {
  try {
    const admin = createAdminClient();

    const { data: tier, error: tierError } = await admin
      .from("ticket_tiers")
      .select("id, event_id")
      .eq("id", tierId)
      .maybeSingle();

    if (tierError) {
      console.error("[verifyTierOwnership] tier lookup error:", tierError);
      return { error: "Failed to verify tier.", tier: null, eventId: null };
    }
    if (!tier) return { error: "Tier not found.", tier: null, eventId: null };

    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, collective_id")
      .eq("id", tier.event_id)
      .maybeSingle();

    if (eventError) {
      console.error("[verifyTierOwnership] event lookup error:", eventError);
      return { error: "Failed to verify event.", tier: null, eventId: null };
    }
    if (!event) return { error: "Event not found.", tier: null, eventId: null };

    const { data: memberships, error: memberError } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (memberError) {
      console.error("[verifyTierOwnership] membership lookup error:", memberError);
      return { error: "Failed to verify permissions.", tier: null, eventId: null };
    }

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

    if (!collectiveIds.includes(event.collective_id)) {
      return { error: "You don't have permission to manage this tier.", tier: null, eventId: null };
    }

    return { error: null, tier, eventId: tier.event_id };
  } catch (err) {
    console.error("[verifyTierOwnership]", err);
    return { error: "Something went wrong", tier: null, eventId: null };
  }
}

async function verifyEventOwnership(userId: string, eventId: string) {
  try {
    const admin = createAdminClient();

    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[verifyEventOwnership] event lookup error:", eventError);
      return { error: "Failed to verify event." };
    }
    if (!event) return { error: "Event not found." };

    const { data: memberships, error: memberError } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (memberError) {
      console.error("[verifyEventOwnership] membership lookup error:", memberError);
      return { error: "Failed to verify permissions." };
    }

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

    if (!collectiveIds.includes(event.collective_id)) {
      return { error: "You don't have permission to manage this event." };
    }

    return { error: null };
  } catch (err) {
    console.error("[verifyEventOwnership]", err);
    return { error: "Something went wrong" };
  }
}

export async function updateTicketTier(
  tierId: string,
  data: { name: string; price: number; capacity: number }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in." };

    if (!tierId?.trim()) return { error: "Tier ID is required." };

    // Validate inputs
    if (data.name == null) return { error: "Tier name is required." };
    const trimmedName = data.name.trim();
    if (!trimmedName) return { error: "Tier name is required." };
    if (trimmedName.length > 100) return { error: "Tier name must be under 100 characters." };
    if (data.price < 0) return { error: "Price must be $0 or more." };
    if (data.price > 99999.99) return { error: "Price must be under $100,000." };
    if (!Number.isFinite(data.price)) return { error: "Invalid price." };
    if (data.capacity < 1) return { error: "Capacity must be at least 1." };
    if (data.capacity > 1000000) return { error: "Capacity must be under 1,000,000." };
    if (!Number.isInteger(data.capacity)) return { error: "Capacity must be a whole number." };

    // Round price to 2 decimal places
    const price = Math.round(data.price * 100) / 100;

    const ownership = await verifyTierOwnership(user.id, tierId);
    if (ownership.error) return { error: ownership.error };

    const admin = createAdminClient();

    // Advisory check: count sold tickets to give a helpful error message.
    const { count: soldCount } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("tier_id", tierId)
      .in("status", ["valid", "checked_in"]);

    const sold = soldCount ?? 0;
    if (data.capacity < sold) {
      return {
        error: `Capacity can't be less than ${sold} (tickets already sold).`,
      };
    }

    const { error } = await admin
      .from("ticket_tiers")
      .update({
        name: trimmedName,
        price,
        capacity: data.capacity,
      })
      .eq("id", tierId);

    if (error) return { error: "Failed to update tier" };

    // Re-verify after update: if more tickets were sold during the race window,
    // revert the capacity to the current sold count to avoid underselling.
    const { count: postUpdateSold } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("tier_id", tierId)
      .in("status", ["valid", "checked_in"]);

    const actualSold = postUpdateSold ?? 0;
    if (data.capacity < actualSold) {
      // Race detected: more tickets were sold between our check and update.
      // Correct the capacity to match the actual sold count.
      await admin
        .from("ticket_tiers")
        .update({ capacity: actualSold })
        .eq("id", tierId);

      revalidatePath(`/dashboard/events/${ownership.eventId}`);
      return {
        error: `Capacity was adjusted to ${actualSold} — additional tickets were sold while updating.`,
      };
    }

    revalidatePath(`/dashboard/events/${ownership.eventId}`);
    return { error: null };
  } catch (err) {
    console.error("[updateTicketTier]", err);
    return { error: "Something went wrong" };
  }
}

export async function createTicketTier(
  eventId: string,
  data: { name: string; price: number; capacity: number }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in." };

    if (!eventId?.trim()) return { error: "Event ID is required." };

    // Validate inputs
    if (data.name == null) return { error: "Tier name is required." };
    const trimmedName = data.name.trim();
    if (!trimmedName) return { error: "Tier name is required." };
    if (trimmedName.length > 100) return { error: "Tier name must be under 100 characters." };
    if (data.price < 0) return { error: "Price must be $0 or more." };
    if (data.price > 99999.99) return { error: "Price must be under $100,000." };
    if (!Number.isFinite(data.price)) return { error: "Invalid price." };
    if (data.capacity < 1) return { error: "Capacity must be at least 1." };
    if (data.capacity > 1000000) return { error: "Capacity must be under 1,000,000." };
    if (!Number.isInteger(data.capacity)) return { error: "Capacity must be a whole number." };

    // Round price to 2 decimal places
    const price = Math.round(data.price * 100) / 100;

    const ownership = await verifyEventOwnership(user.id, eventId);
    if (ownership.error) return { error: ownership.error };

    const admin = createAdminClient();

    // Get current max sort_order
    const { data: existingTiers } = await admin
      .from("ticket_tiers")
      .select("sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder =
      existingTiers && existingTiers.length > 0
        ? (existingTiers[0].sort_order ?? 0) + 1
        : 0;

    const { data: newTier, error } = await admin
      .from("ticket_tiers")
      .insert({
        event_id: eventId,
        name: trimmedName,
        price,
        capacity: data.capacity,
        sort_order: nextOrder,
      })
      .select("id, name, price, capacity, sort_order")
      .maybeSingle();

    if (error) return { error: "Failed to create tier", tier: null };

    revalidatePath(`/dashboard/events/${eventId}`);
    return { error: null, tier: newTier };
  } catch (err) {
    console.error("[createTicketTier]", err);
    return { error: "Something went wrong", tier: null };
  }
}

export async function deleteTicketTier(tierId: string) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in." };

    if (!tierId?.trim()) return { error: "Tier ID is required." };

    const ownership = await verifyTierOwnership(user.id, tierId);
    if (ownership.error) return { error: ownership.error };

    const admin = createAdminClient();

    // Check if any tickets have been sold
    const { count: soldCount } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("tier_id", tierId)
      .in("status", ["valid", "checked_in"]);

    if (soldCount && soldCount > 0) {
      return {
        error: `Can't delete this tier — ${soldCount} ticket${soldCount > 1 ? "s" : ""} already sold.`,
      };
    }

    const { error } = await admin
      .from("ticket_tiers")
      .delete()
      .eq("id", tierId);

    if (error) return { error: "Failed to delete tier" };

    revalidatePath(`/dashboard/events/${ownership.eventId}`);
    return { error: null };
  } catch (err) {
    console.error("[deleteTicketTier]", err);
    return { error: "Something went wrong" };
  }
}

export async function reorderTicketTiers(tierIds: string[]) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in." };

    if (!tierIds || tierIds.length === 0) return { error: "No tiers to reorder." };

    // Verify ownership of the first tier
    const ownership = await verifyTierOwnership(user.id, tierIds[0]);
    if (ownership.error) return { error: ownership.error };

    const admin = createAdminClient();

    // Verify ALL tier IDs belong to the same event (prevents cross-event manipulation)
    const { data: allTiers, error: tiersError } = await admin
      .from("ticket_tiers")
      .select("id, event_id")
      .in("id", tierIds);

    if (tiersError) return { error: "Failed to verify tiers" };

    if (!allTiers || allTiers.length !== tierIds.length) {
      return { error: "One or more tiers not found." };
    }

    if (!ownership.tier) return { error: "Tier not found" };
    const ownerEventId = ownership.tier.event_id;

    const eventIds = new Set(allTiers.map((t) => t.event_id));
    if (eventIds.size > 1 || !eventIds.has(ownerEventId)) {
      return { error: "All tiers must belong to the same event." };
    }

    // Update sort_order for each tier — scoped to the verified event
    const updates = tierIds.map((id, index) =>
      admin
        .from("ticket_tiers")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("event_id", ownerEventId)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return { error: "Failed to reorder tiers" };
    }

    revalidatePath(`/dashboard/events/${ownership.eventId}`);
    return { error: null };
  } catch (err) {
    console.error("[reorderTicketTiers]", err);
    return { error: "Something went wrong" };
  }
}
