import { notFound } from "next/navigation";
import { isValidUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

interface Props {
  params: Promise<{ eventId: string }>;
  children: React.ReactNode;
}

export default async function EventIdLayout({ params, children }: Props) {
  const { eventId } = await params;

  if (!isValidUUID(eventId)) {
    notFound();
  }

  // ── Server-side auth + collective-membership check ────────────────────────
  // Don't rely solely on RLS — verify the authenticated user is a member of
  // the collective that owns this event. Call notFound() (not 403) so we
  // don't leak whether the event exists to unauthorized users.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event?.collective_id) {
    notFound();
  }

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count) notFound();

  return <>{children}</>;
}
