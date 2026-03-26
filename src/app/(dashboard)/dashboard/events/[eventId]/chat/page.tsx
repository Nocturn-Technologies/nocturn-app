import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { redirect, notFound } from "next/navigation";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function EventChatPage({ params }: Props) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  // Use admin client to bypass RLS
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

  // Fetch the event to verify access and get title
  const { data: event } = await admin
    .from("events")
    .select("id, title, collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !collectiveIds.includes(event.collective_id)) notFound();

  // Look for existing event channel
  const { data: channel } = await admin
    .from("channels")
    .select("id")
    .eq("event_id", eventId)
    .eq("collective_id", event.collective_id)
    .eq("type", "event")
    .maybeSingle();

  if (channel) {
    redirect(`/dashboard/chat/${channel.id}`);
  }

  // No channel exists — create one
  const { data: newChannel } = await admin
    .from("channels")
    .insert({
      collective_id: event.collective_id,
      event_id: event.id,
      name: event.title,
      type: "event",
    })
    .select("id")
    .single();

  if (!newChannel) notFound();

  redirect(`/dashboard/chat/${newChannel.id}`);
}
