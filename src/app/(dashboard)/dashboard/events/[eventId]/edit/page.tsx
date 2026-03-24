import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EditEventForm } from "./edit-event-form";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function EditEventPage({ params }: Props) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const admin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify user owns this event via collective membership
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  if (collectiveIds.length === 0) notFound();

  // Fetch event with venue
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, slug, description, starts_at, ends_at, doors_at, status, collective_id, venue_id, bar_minimum, venue_deposit, venue_cost, estimated_bar_revenue, venues(id, name, address, city, capacity)"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !collectiveIds.includes(event.collective_id)) notFound();

  // Only draft events can be edited
  if (event.status !== "draft") {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-2xl font-bold mb-2">Cannot Edit Event</h1>
        <p className="text-muted-foreground">
          Only draft events can be edited. This event has status &ldquo;{event.status}&rdquo;.
        </p>
      </div>
    );
  }

  // Fetch ticket tiers
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, name, price, capacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order");

  const venue = event.venues as unknown as {
    id: string;
    name: string;
    address: string;
    city: string;
    capacity: number;
  } | null;

  // Extract date and time parts from ISO strings
  const startsAt = new Date(event.starts_at);
  const date = startsAt.toISOString().split("T")[0]; // YYYY-MM-DD
  const startTime = startsAt.toTimeString().slice(0, 5); // HH:MM

  let endTime = "";
  if (event.ends_at) {
    const endsAt = new Date(event.ends_at);
    endTime = endsAt.toTimeString().slice(0, 5);
  }

  let doorsOpen = "";
  if (event.doors_at) {
    const doorsAt = new Date(event.doors_at);
    doorsOpen = doorsAt.toTimeString().slice(0, 5);
  }

  const eventData = {
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    date,
    startTime,
    endTime,
    doorsOpen,
    venueName: venue?.name ?? "",
    venueAddress: venue?.address ?? "",
    venueCity: venue?.city ?? "",
    venueCapacity: venue?.capacity ?? 0,
    tiers:
      tiers?.map((t) => ({
        id: t.id,
        name: t.name,
        price: Number(t.price),
        quantity: t.capacity ?? 0,
      })) ?? [],
    barMinimum: event.bar_minimum ? Number(event.bar_minimum) : null,
    venueDeposit: event.venue_deposit ? Number(event.venue_deposit) : null,
    venueCost: event.venue_cost ? Number(event.venue_cost) : null,
    estimatedBarRevenue: event.estimated_bar_revenue ? Number(event.estimated_bar_revenue) : null,
  };

  return <EditEventForm event={eventData} />;
}
