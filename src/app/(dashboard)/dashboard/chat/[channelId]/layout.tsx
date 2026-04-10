import { notFound } from "next/navigation";
import { isValidUUID } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

interface Props {
  params: Promise<{ channelId: string }>;
  children: React.ReactNode;
}

export default async function ChannelIdLayout({ params, children }: Props) {
  const { channelId } = await params;

  if (!isValidUUID(channelId)) {
    notFound();
  }

  // ── Server-side auth + collective-membership check ────────────────────────
  // Don't rely solely on RLS — verify the authenticated user is a member of
  // the collective that owns this channel. Channels are always scoped to a
  // collective (collective_id is NOT NULL). Call notFound() (not 403) so we
  // don't leak whether the channel exists.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const admin = createAdminClient();

  const { data: channel } = await admin
    .from("channels")
    .select("collective_id")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel?.collective_id) {
    notFound();
  }

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", channel.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count) notFound();

  return <>{children}</>;
}
