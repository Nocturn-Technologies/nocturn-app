"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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
}

export async function createEvent(input: CreateEventInput) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const admin = createAdminClient();

  // Get user's first collective
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
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
    const { data: newVenue, error: venueError } = await admin
      .from("venues")
      .insert({
        name: input.venueName,
        slug: slugify(input.venueName),
        address: input.venueAddress,
        city: input.venueCity,
        capacity: input.venueCapacity,
      })
      .select("id")
      .single();

    if (venueError) {
      return { error: `Venue error: ${venueError.message}` };
    }
    venueId = newVenue.id;
  }

  // Build timestamps from date + time inputs
  const startsAt = new Date(`${input.date}T${input.startTime}:00`).toISOString();
  const endsAt = input.endTime
    ? new Date(`${input.date}T${input.endTime}:00`).toISOString()
    : null;
  const doorsAt = input.doorsOpen
    ? new Date(`${input.date}T${input.doorsOpen}:00`).toISOString()
    : null;

  // Create event
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      collective_id: collectiveId,
      venue_id: venueId,
      title: input.title,
      slug: input.slug,
      description: input.description,
      starts_at: startsAt,
      ends_at: endsAt,
      doors_at: doorsAt,
      status: "draft",
    })
    .select("id")
    .single();

  if (eventError) {
    return { error: `Event error: ${eventError.message}` };
  }

  // Create ticket tiers
  if (input.tiers.length > 0) {
    const { error: tierError } = await admin.from("ticket_tiers").insert(
      input.tiers.map((t, i) => ({
        event_id: event.id,
        name: t.name,
        price: t.price,
        capacity: t.quantity,
        sort_order: i,
      }))
    );

    if (tierError) {
      console.error("Ticket tier error:", tierError);
      return { error: `Event created but ticket tiers failed: ${tierError.message}`, eventId: event.id };
    }
  }

  return { error: null, eventId: event.id };
}

export async function updateEvent(eventId: string, input: UpdateEventInput) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  if (ownership.event!.status !== "draft") {
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
    const { data: newVenue, error: venueError } = await admin
      .from("venues")
      .insert({
        name: input.venueName,
        slug: slugify(input.venueName),
        address: input.venueAddress,
        city: input.venueCity,
        capacity: input.venueCapacity,
      })
      .select("id")
      .single();

    if (venueError) {
      return { error: `Venue error: ${venueError.message}` };
    }
    venueId = newVenue.id;
  }

  // Build timestamps
  const startsAt = new Date(`${input.date}T${input.startTime}:00`).toISOString();
  const endsAt = input.endTime
    ? new Date(`${input.date}T${input.endTime}:00`).toISOString()
    : null;
  const doorsAt = input.doorsOpen
    ? new Date(`${input.date}T${input.doorsOpen}:00`).toISOString()
    : null;

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
      .in("id", input.removedTierIds);

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
        .eq("id", tier.id);

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

  return { error: null };
}

async function verifyEventOwnership(userId: string, eventId: string) {
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId);

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found.", event: null };
  }

  const collectiveIds = memberships.map((m) => m.collective_id);

  // Fetch event and verify it belongs to one of user's collectives
  const { data: event } = await admin
    .from("events")
    .select("id, status, collective_id")
    .eq("id", eventId)
    .single();

  if (!event) {
    return { error: "Event not found.", event: null };
  }

  if (!collectiveIds.includes(event.collective_id)) {
    return { error: "You don't have permission to manage this event.", event: null };
  }

  return { error: null, event };
}

export async function publishEvent(eventId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  if (ownership.event!.status !== "draft") {
    return { error: `Cannot publish an event with status "${ownership.event!.status}". Only draft events can be published.` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId);

  if (error) return { error: `Failed to publish: ${error.message}` };
  return { error: null };
}

export async function cancelEvent(eventId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  const status = ownership.event!.status;
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
  return { error: null };
}

export async function completeEvent(eventId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  const status = ownership.event!.status;
  if (status !== "published" && status !== "upcoming") {
    return { error: `Cannot complete an event with status "${status}". Only published or upcoming events can be completed.` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);

  if (error) return { error: `Failed to complete: ${error.message}` };
  return { error: null };
}
