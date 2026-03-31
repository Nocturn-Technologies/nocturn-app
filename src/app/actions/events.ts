"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/config";
import { generateAutoSettlement } from "./auto-settlement";
import { getStripe } from "@/lib/stripe";
import { DEFAULT_TIMEZONE } from "@/lib/utils";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface CreateEventInput {
  title: string;
  slug: string;
  description: string | null;
  date: string;
  doorsOpen: string | null;
  startTime: string;
  endTime: string | null;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCapacity: number;
  tiers: { name: string; price: number; quantity: number }[];
  timezone?: string; // IANA timezone, defaults to America/Toronto
}

interface UpdateEventInput {
  title: string;
  description: string | null;
  date: string;
  doorsOpen: string | null;
  startTime: string;
  endTime: string | null;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCapacity: number;
  tiers: { id?: string; name: string; price: number; quantity: number }[];
  removedTierIds: string[];
  barMinimum?: number | null;
  venueDeposit?: number | null;
  venueCost?: number | null;
  estimatedBarRevenue?: number | null;
  timezone?: string; // IANA timezone, defaults to America/Toronto
}

export async function createEvent(input: CreateEventInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  if (input.description && input.description.length > 5000) {
    return { error: "Description is too long. Please keep it under 5,000 characters." };
  }

  // Title validation
  const trimmedTitle = input.title?.trim();
  if (!trimmedTitle || trimmedTitle.length === 0) {
    return { error: "Event title is required." };
  }
  if (trimmedTitle.length > 200) {
    return { error: "Event title must be under 200 characters." };
  }

  // Tier validation (same rules as ticket-tiers.ts createTicketTier)
  for (const t of input.tiers) {
    const tierName = t.name?.trim();
    if (!tierName || tierName.length === 0) {
      return { error: "Invalid ticket tier: name is required." };
    }
    if (tierName.length > 100) {
      return { error: "Invalid ticket tier: name must be under 100 characters." };
    }
    if (t.price < 0 || t.price > 99999.99 || !Number.isFinite(t.price)) {
      return { error: "Invalid ticket tier: price must be between $0 and $99,999.99." };
    }
    if (t.quantity < 1 || t.quantity > 1000000 || !Number.isInteger(t.quantity)) {
      return { error: "Invalid ticket tier: capacity must be a whole number between 1 and 1,000,000." };
    }
  }

  const admin = createAdminClient();

  // Get user's first collective
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found. Please create one first." };
  }

  const collectiveId = memberships[0].collective_id;

  // Create or find venue
  let venueId: string;
  const { data: existingVenue } = await admin
    .from("venues")
    .select("id")
    .eq("name", input.venueName)
    .eq("city", input.venueCity)
    .limit(1)
    .maybeSingle();

  if (existingVenue) {
    venueId = existingVenue.id;
  } else {
    // Include city in slug to avoid collisions (e.g. "story-miami" vs "story-toronto")
    const baseSlug = slugify(`${input.venueName} ${input.venueCity || ""}`);
    let venueSlug = baseSlug;

    // Check if slug already exists, add random suffix if so
    const { data: slugCheck } = await admin
      .from("venues")
      .select("id")
      .eq("slug", venueSlug)
      .maybeSingle();

    if (slugCheck) {
      venueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: newVenue, error: venueError } = await admin
      .from("venues")
      .insert({
        name: input.venueName,
        slug: venueSlug,
        address: input.venueAddress,
        city: input.venueCity,
        capacity: input.venueCapacity,
      })
      .select("id")
      .maybeSingle();

    if (venueError) {
      return { error: `Venue error: ${venueError.message}` };
    }
    if (!newVenue) return { error: "Failed to create venue" };
    venueId = newVenue.id;
  }

  // Build timestamps from date + time inputs
  // Use America/Toronto timezone by default for nightlife events
  // The ISO string with offset ensures correct storage regardless of server timezone
  const tz = input.timezone ?? DEFAULT_TIMEZONE;
  function toTimestamp(date: string, time: string): string {
    // Create date string with explicit timezone offset
    // This ensures "10pm" in Toronto is stored as 10pm ET, not 10pm UTC
    const dt = new Date(`${date}T${time}:00`);
    // Format with timezone using Intl to get the correct offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "longOffset",
    });
    // Use the formatter to get the correct offset for the given timezone
    const parts = formatter.formatToParts(dt);
    const offsetPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+00:00";
    // longOffset gives e.g. "GMT-04:00" — strip the "GMT" prefix
    const offset = offsetPart.replace("GMT", "") || "+00:00";
    return `${date}T${time}:00${offset}`;
  }

  const startsAt = toTimestamp(input.date, input.startTime);

  // Cross-midnight handling: if end time is before start time, add one day
  let endDate = input.date;
  if (input.endTime) {
    const [startHour, startMinute] = input.startTime.split(":").map(Number);
    const [endHour, endMinute] = input.endTime.split(":").map(Number);
    if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
      const nextDay = new Date(`${input.date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().split("T")[0];
    }
  }

  const endsAt = input.endTime
    ? toTimestamp(endDate, input.endTime)
    : null;
  const doorsAt = input.doorsOpen
    ? toTimestamp(input.date, input.doorsOpen)
    : null;

  // Validate event is not in the past (allow same-day events)
  const eventDate = new Date(startsAt);
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Compare dates, not times
  if (eventDate < now) {
    return { error: "Event date can't be in the past. Pick a future date." };
  }

  // Enrich event with AI-generated content if no description provided
  let enrichedDescription = input.description;
  let vibeTags: string[] = [];
  let dressCode: string | null = null;
  let hostMessage: string | null = null;

  if (!input.description || input.description.length < 20) {
    try {
      const { enrichEventContent } = await import("./ai-enrich-event");
      const { data: collective } = await admin
        .from("collectives")
        .select("name")
        .eq("id", collectiveId)
        .maybeSingle();

      const enriched = await enrichEventContent({
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        venueName: input.venueName,
        venueCity: input.venueCity,
        headlinerType: (input as unknown as Record<string, unknown>).headlinerType as string | undefined,
        collectiveName: collective?.name ?? undefined,
        tiers: input.tiers.map(t => ({ name: t.name, price: t.price })),
      });

      enrichedDescription = enriched.description;
      vibeTags = enriched.vibeTags;
      dressCode = enriched.dressCode;
      hostMessage = enriched.hostMessage;
    } catch (err) {
      console.error("AI enrichment failed, continuing without:", err);
    }
  }

  // Check for slug collision, append random suffix if needed
  let eventSlug = input.slug;
  const { data: slugCheck } = await admin
    .from("events")
    .select("id")
    .eq("slug", eventSlug)
    .maybeSingle();
  if (slugCheck) {
    eventSlug = `${eventSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Create event
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      collective_id: collectiveId,
      venue_id: venueId,
      title: trimmedTitle,
      slug: eventSlug,
      description: enrichedDescription,
      starts_at: startsAt,
      ends_at: endsAt,
      doors_at: doorsAt,
      status: "draft",
      vibe_tags: vibeTags.length > 0 ? vibeTags : undefined,
      metadata: {
        timezone: tz,
        ...(dressCode ? { dress_code: dressCode } : {}),
        ...(hostMessage ? { host_message: hostMessage } : {}),
      },
    })
    .select("id")
    .maybeSingle();

  if (eventError) {
    return { error: `Event error: ${eventError.message}` };
  }
  if (!event) return { error: "Failed to create event" };

  // Create ticket tiers (with price rounding)
  if (input.tiers.length > 0) {
    const { error: tierError } = await admin.from("ticket_tiers").insert(
      input.tiers.map((t, i) => ({
        event_id: event.id,
        name: t.name.trim(),
        price: Math.round(t.price * 100) / 100,
        capacity: t.quantity,
        sort_order: i,
      }))
    );

    if (tierError) {
      console.error("Ticket tier error:", tierError);
      // Cleanup: delete the event that was just created
      await admin.from("events").delete().eq("id", event.id);
      return { error: `Ticket tier creation failed: ${tierError.message}` };
    }
  }

  // Track event creation
  import("@/lib/track-server").then(({ trackServerEvent }) =>
    trackServerEvent("event_created", { eventId: event.id, title: trimmedTitle, collectiveId: memberships[0].collective_id })
  ).catch(() => {});

  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard");
  return { error: null, eventId: event.id };
  } catch (err) {
    console.error("[createEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function updateEvent(eventId: string, input: UpdateEventInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  if (input.description && input.description.length > 5000) {
    return { error: "Description is too long. Please keep it under 5,000 characters." };
  }

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  if (ownership.event.status !== "draft") {
    return { error: "Only draft events can be edited." };
  }

  const admin = createAdminClient();

  // Create or find venue
  let venueId: string;
  const { data: existingVenue } = await admin
    .from("venues")
    .select("id")
    .eq("name", input.venueName)
    .eq("city", input.venueCity)
    .limit(1)
    .maybeSingle();

  if (existingVenue) {
    venueId = existingVenue.id;
    // Update venue details
    await admin
      .from("venues")
      .update({
        address: input.venueAddress,
        capacity: input.venueCapacity,
      })
      .eq("id", venueId);
  } else {
    const baseSlug = slugify(`${input.venueName} ${input.venueCity || ""}`);
    let venueSlug = baseSlug;
    const { data: slugCheck } = await admin
      .from("venues")
      .select("id")
      .eq("slug", venueSlug)
      .maybeSingle();
    if (slugCheck) {
      venueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: newVenue, error: venueError } = await admin
      .from("venues")
      .insert({
        name: input.venueName,
        slug: venueSlug,
        address: input.venueAddress,
        city: input.venueCity,
        capacity: input.venueCapacity,
      })
      .select("id")
      .maybeSingle();

    if (venueError) {
      return { error: `Venue error: ${venueError.message}` };
    }
    if (!newVenue) return { error: "Failed to create venue" };
    venueId = newVenue.id;
  }

  // Build timestamps with timezone awareness (same approach as createEvent)
  const tz = input.timezone ?? DEFAULT_TIMEZONE;
  function toTimestamp(date: string, time: string): string {
    const dt = new Date(`${date}T${time}:00`);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(dt);
    const offsetPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+00:00";
    const offset = offsetPart.replace("GMT", "") || "+00:00";
    return `${date}T${time}:00${offset}`;
  }

  const startsAt = toTimestamp(input.date, input.startTime);
  const endsAt = input.endTime
    ? toTimestamp(input.date, input.endTime)
    : null;
  const doorsAt = input.doorsOpen
    ? toTimestamp(input.date, input.doorsOpen)
    : null;

  // Validate tier prices before any DB writes
  if (input.tiers.some((t) => t.price < 0)) {
    return { error: "Tier prices cannot be negative" };
  }

  // Update event
  const { error: eventError } = await admin
    .from("events")
    .update({
      venue_id: venueId,
      title: input.title,
      slug: slugify(input.title),
      description: input.description,
      starts_at: startsAt,
      ends_at: endsAt,
      doors_at: doorsAt,
      bar_minimum: input.barMinimum ?? null,
      venue_deposit: input.venueDeposit ?? null,
      venue_cost: input.venueCost ?? null,
      estimated_bar_revenue: input.estimatedBarRevenue ?? null,
    })
    .eq("id", eventId);

  if (eventError) {
    return { error: `Event error: ${eventError.message}` };
  }

  // Remove deleted tiers
  if (input.removedTierIds.length > 0) {
    const { error: deleteError } = await admin
      .from("ticket_tiers")
      .delete()
      .in("id", input.removedTierIds)
      .eq("event_id", eventId);

    if (deleteError) {
      return { error: `Failed to remove tiers: ${deleteError.message}` };
    }
  }

  // Upsert tiers (update existing, insert new)
  for (let i = 0; i < input.tiers.length; i++) {
    const tier = input.tiers[i];
    if (tier.id) {
      // Update existing tier
      const { error: tierError } = await admin
        .from("ticket_tiers")
        .update({
          name: tier.name,
          price: tier.price,
          capacity: tier.quantity,
          sort_order: i,
        })
        .eq("id", tier.id)
        .eq("event_id", eventId);

      if (tierError) {
        return { error: `Tier update error: ${tierError.message}` };
      }
    } else {
      // Insert new tier
      const { error: tierError } = await admin
        .from("ticket_tiers")
        .insert({
          event_id: eventId,
          name: tier.name,
          price: tier.price,
          capacity: tier.quantity,
          sort_order: i,
        });

      if (tierError) {
        return { error: `Tier insert error: ${tierError.message}` };
      }
    }
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");

  return { error: null };
  } catch (err) {
    console.error("[updateEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

async function verifyEventOwnership(userId: string, eventId: string) {
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found.", event: null };
  }

  const collectiveIds = memberships.map((m) => m.collective_id);

  // Fetch event and verify it belongs to one of user's collectives
  const { data: event } = await admin
    .from("events")
    .select("id, status, collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return { error: "Event not found.", event: null };
  }

  if (!collectiveIds.includes(event.collective_id)) {
    return { error: "You don't have permission to manage this event.", event: null };
  }

  return { error: null, event };
}

export async function publishEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  if (ownership.event.status !== "draft") {
    return { error: `Cannot publish an event with status "${ownership.event.status}". Only draft events can be published.` };
  }

  const admin = createAdminClient();

  // Verify event has at least 1 ticket tier
  const { count: tierCount } = await admin
    .from("ticket_tiers")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (!tierCount || tierCount === 0) {
    return { error: "Add at least one ticket tier before publishing. Your event needs a way for people to get in." };
  }

  const { error } = await admin
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId);

  if (error) return { error: `Failed to publish: ${error.message}` };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");

  import("@/lib/track-server").then(({ trackServerEvent }) =>
    trackServerEvent("event_published", { eventId })
  ).catch(() => {});

  return { error: null };
  } catch (err) {
    console.error("[publishEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function cancelEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  const status = ownership.event.status;
  if (status === "cancelled") {
    return { error: "Event is already cancelled." };
  }
  if (status === "completed") {
    return { error: "Cannot cancel a completed event." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);

  if (error) return { error: `Failed to cancel: ${error.message}` };

  // --- Refund all paid and checked-in tickets ---
  const { data: paidTickets } = await admin
    .from("tickets")
    .select("id, price_paid, stripe_payment_intent_id, metadata")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  const refundResults: { ticketId: string; success: boolean; error?: string }[] = [];

  if (paidTickets && paidTickets.length > 0) {
    const stripe = getStripe();

    const results = await Promise.allSettled(
      paidTickets.map(async (ticket) => {
        const pricePaid = Number(ticket.price_paid) || 0;

        // Issue Stripe refund if there was a real payment
        if (ticket.stripe_payment_intent_id && pricePaid > 0) {
          try {
            await stripe.refunds.create({
              payment_intent: ticket.stripe_payment_intent_id,
              amount: Math.round(pricePaid * 100),
              reason: "requested_by_customer",
            });
          } catch (stripeErr) {
            const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed";
            console.error(`[cancelEvent] Stripe refund failed for ticket ${ticket.id}:`, msg);
            throw new Error(msg);
          }
        }

        // Update ticket to refunded
        const { error: updateErr } = await admin
          .from("tickets")
          .update({
            status: "refunded",
            metadata: {
              ...(ticket.metadata as Record<string, unknown>),
              refunded_at: new Date().toISOString(),
              refunded_by: user.id,
              refund_reason: "event_cancelled",
              refund_amount: pricePaid,
            },
          })
          .eq("id", ticket.id);

        if (updateErr) throw new Error(updateErr.message);
        return ticket.id;
      })
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        refundResults.push({ ticketId: paidTickets[i].id, success: true });
      } else {
        refundResults.push({ ticketId: paidTickets[i].id, success: false, error: result.reason?.message });
      }
    });
  }

  // --- Cancel remaining non-refunded tickets (pending, free, etc.) ---
  await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .not("status", "in", "(refunded,cancelled)");

  // --- Cancel waitlist entries ---
  await admin
    .from("waitlist_entries")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .neq("status", "cancelled");

  // --- Log the cancellation in event_activity ---
  await admin
    .from("event_activity")
    .insert({
      event_id: eventId,
      user_id: user.id,
      type: "event_cancelled",
      metadata: {
        cancelled_at: new Date().toISOString(),
        tickets_refunded: refundResults.filter((r) => r.success).length,
        tickets_failed: refundResults.filter((r) => !r.success).length,
        previous_status: status,
      },
    });

  revalidatePath("/dashboard/events");

  const failedRefunds = refundResults.filter((r) => !r.success);
  if (failedRefunds.length > 0) {
    return {
      error: null,
      warning: `Event cancelled but ${failedRefunds.length} ticket refund(s) failed. Check the dashboard to retry.`,
      failedRefunds,
    };
  }

  return { error: null };
  } catch (err) {
    console.error("[cancelEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function completeEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  const status = ownership.event.status;
  if (status !== "published" && status !== "upcoming") {
    return { error: `Cannot complete an event with status "${status}". Only published or upcoming events can be completed.` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);

  if (error) return { error: `Failed to complete: ${error.message}` };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/finance");

  // Auto-generate settlement + CRM enrichment
  const settlementResult = await generateAutoSettlement(eventId);
  if (settlementResult.error) {
    console.error("Auto-settlement warning:", settlementResult.error);
    // Non-fatal — event was still completed successfully
  }

  return { error: null };
  } catch (err) {
    console.error("[completeEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

interface EventDesignInput {
  flyerUrl?: string | null;
  description?: string | null;
  vibeTags?: string[];
  minAge?: number | null;
  dressCode?: string | null;
  themeColor?: string | null;
  hostMessage?: string | null;
}

export async function updateEventDesign(eventId: string, input: EventDesignInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  const admin = createAdminClient();

  // Fetch current metadata to merge
  const { data: currentEvent } = await admin
    .from("events")
    .select("metadata")
    .eq("id", eventId)
    .maybeSingle();

  const existingMetadata = (currentEvent?.metadata ?? {}) as Record<string, unknown>;

  // Build update payload
  const updatePayload: Record<string, unknown> = {};

  if (input.flyerUrl !== undefined) {
    updatePayload.flyer_url = input.flyerUrl;
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description;
  }
  if (input.vibeTags !== undefined) {
    updatePayload.vibe_tags = input.vibeTags;
  }
  if (input.minAge !== undefined) {
    updatePayload.min_age = input.minAge;
  }

  // Store extras in metadata JSONB
  const newMetadata = { ...existingMetadata };
  if (input.dressCode !== undefined) {
    newMetadata.dressCode = input.dressCode;
  }
  if (input.themeColor !== undefined) {
    newMetadata.themeColor = input.themeColor;
  }
  if (input.hostMessage !== undefined) {
    newMetadata.hostMessage = input.hostMessage;
  }
  updatePayload.metadata = newMetadata;

  const { error } = await admin
    .from("events")
    .update(updatePayload)
    .eq("id", eventId);

  if (error) return { error: `Failed to update design: ${error.message}` };
  return { error: null };
  } catch (err) {
    console.error("[updateEventDesign] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function getEventDesign(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in.", event: null };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error, event: null };

  const admin = createAdminClient();
  const [eventRes, artistsRes] = await Promise.all([
    admin
      .from("events")
      .select("id, title, slug, description, flyer_url, vibe_tags, min_age, metadata, collective_id, starts_at, doors_at, venues(name, city, address)")
      .eq("id", eventId)
      .maybeSingle(),
    admin
      .from("event_artists")
      .select("artists(name)")
      .eq("event_id", eventId),
  ]);

  const event = eventRes.data;
  if (!event) return { error: "Event not found.", event: null };

  // Get collective slug for preview link
  const { data: collective } = await admin
    .from("collectives")
    .select("slug")
    .eq("id", event.collective_id)
    .maybeSingle();

  // Extract artist names and venue for poster pre-fill
  const venue = event.venues as unknown as { name: string; city: string; address: string | null } | null;
  const artistNames = (artistsRes.data || [])
    .map((a) => (a.artists as unknown as { name: string })?.name)
    .filter(Boolean);

  const dateDisplay = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })
    : null;

  const timeDisplay = event.starts_at
    ? new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;

  const doorsDisplay = event.doors_at
    ? new Date(event.doors_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;

  return {
    error: null,
    event: {
      ...event,
      collectiveSlug: collective?.slug ?? null,
      venueName: venue?.name ?? null,
      venueCity: venue?.city ?? null,
      venueAddress: venue?.address ?? null,
      artistNames,
      dateDisplay,
      timeDisplay,
      doorsDisplay,
    },
  };
  } catch (err) {
    console.error("[getEventDesign] Unexpected error:", err);
    return { error: "Something went wrong", event: null };
  }
}
