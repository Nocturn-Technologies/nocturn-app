import { createAdminClient } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { readEventCommercialConfig } from "@/lib/event-commercials";
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

  const admin = createAdminClient();

  // Verify user owns this event via collective membership
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  if (collectiveIds.length === 0) notFound();

  // Fetch event with flat venue columns
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, slug, description, starts_at, ends_at, doors_at, status, collective_id, venue_name, venue_address, city, capacity, metadata"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !collectiveIds.includes(event.collective_id)) notFound();

  // Default to USD (currency column removed from schema)
  const resolvedCurrency = "usd";

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

  // Fetch itemized expenses.
  // NOC-35: read actual_amount (new) + amount (legacy) during rename window.
  const { data: expenseRows } = await admin
    .from("event_expenses")
    .select("id, category, description, amount, actual_amount, projected_amount")
    .eq("event_id", eventId)
    .order("created_at");

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

  const commercial = readEventCommercialConfig(event.metadata);

  const eventData = {
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    date,
    startTime,
    endTime,
    doorsOpen,
    venueName: event.venue_name ?? "",
    venueAddress: event.venue_address ?? "",
    venueCity: event.city ?? "",
    venueCapacity: event.capacity ?? 0,
    tiers:
      tiers?.map((t) => ({
        id: t.id,
        name: t.name,
        price: Number(t.price),
        quantity: t.capacity ?? 0,
      })) ?? [],
    barMinimum: commercial.barMinimum,
    venueDeposit: commercial.venueDeposit,
    venueCost: commercial.venueCost,
    estimatedBarRevenue: commercial.projectedBarSales,
    barPercent: commercial.barPercent,
    currency: resolvedCurrency,
    expenses:
      expenseRows?.map((r) => ({
        id: r.id,
        category: r.category ?? "other",
        label: r.description ?? "",
        // NOC-35: prefer actual_amount, fall back to amount during rename window.
        amount: Number(r.actual_amount ?? r.amount ?? 0),
        currency: resolvedCurrency,
      })) ?? [],
  };

  return <EditEventForm event={eventData} />;
}
