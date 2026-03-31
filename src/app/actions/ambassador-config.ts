"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ──

export interface AmbassadorRewardRule {
  id: string;
  threshold: number; // e.g. 3, 5, 10
  rewardType: "free_ticket" | "discount" | "custom";
  rewardValue: string; // e.g. "Free ticket to next event", "20% off", "VIP upgrade"
  active: boolean;
}

export interface AmbassadorConfig {
  enabled: boolean;
  rules: AmbassadorRewardRule[];
  defaultMessage: string;
}

const DEFAULT_CONFIG: AmbassadorConfig = {
  enabled: true,
  rules: [
    {
      id: "default-3",
      threshold: 3,
      rewardType: "discount",
      rewardValue: "20% off your next ticket",
      active: true,
    },
    {
      id: "default-5",
      threshold: 5,
      rewardType: "free_ticket",
      rewardValue: "Free ticket to the next event",
      active: true,
    },
  ],
  defaultMessage: "Share your link — bring friends and earn rewards!",
};

// ── Get ambassador config for an event ──

export async function getAmbassadorConfig(eventId: string): Promise<{
  error: string | null;
  config: AmbassadorConfig;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", config: DEFAULT_CONFIG };

  const admin = createAdminClient();

  // Verify user has access to this event
  const { data: eventRaw } = await admin
    .from("events")
    .select("metadata, collective_id")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventRaw as { metadata: Record<string, unknown> | null; collective_id: string } | null;

  if (!event) return { error: "Event not found", config: DEFAULT_CONFIG };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount || memberCount === 0) return { error: "Not authorized", config: DEFAULT_CONFIG };

  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  const ambassadorConfig = metadata.ambassador_config as AmbassadorConfig | undefined;

  return {
    error: null,
    config: ambassadorConfig ?? DEFAULT_CONFIG,
  };
}

// ── Save ambassador config for an event ──

export async function saveAmbassadorConfig(
  eventId: string,
  config: AmbassadorConfig
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get current metadata + verify ownership
  const { data: eventRaw2 } = await admin
    .from("events")
    .select("metadata, collective_id")
    .eq("id", eventId)
    .maybeSingle();
  const event2 = eventRaw2 as { metadata: Record<string, unknown> | null; collective_id: string } | null;

  if (!event2) return { error: "Event not found" };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event2.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount || memberCount === 0) return { error: "Not authorized" };

  const currentMetadata = (event2.metadata ?? {}) as Record<string, unknown>;

  // Merge ambassador_config into existing metadata
  const updatedMetadata = {
    ...currentMetadata,
    ambassador_config: config,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("events") as any).update({ metadata: updatedMetadata })
    .eq("id", eventId);

  if (error) return { error: error.message };
  return { error: null };
}

