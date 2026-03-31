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

// ── DM Template Generation ──

export interface DMTemplate {
  id: string;
  label: string;
  target: "ambassador" | "repeat_fan" | "first_timer";
  subject: string;
  body: string;
}

export async function generateDMTemplates(
  collectiveSlug: string,
  params: {
    nextEventTitle?: string;
    nextEventDate?: string;
    nextEventSlug?: string;
  }
): Promise<{
  error: string | null;
  templates: DMTemplate[];
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", templates: [] };

  const admin = createAdminClient();

  // Get collective info
  const { data: collectiveRaw } = await admin
    .from("collectives")
    .select("id, name, slug")
    .eq("slug", collectiveSlug)
    .maybeSingle();
  const collective = collectiveRaw as { id: string; name: string; slug: string } | null;

  if (!collective) {
    // Fallback: try by membership
    const { data: membershipsRaw } = await admin
      .from("collective_members")
      .select("collective_id, collectives!inner(id, name, slug)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1);
    const memberships = membershipsRaw as { collective_id: string; collectives: { id: string; name: string; slug: string } | null }[] | null;

    const firstCollective = memberships?.[0]?.collectives;
    if (!firstCollective) return { error: null, templates: [] };

    return generateTemplatesForCollective(firstCollective.name, params);
  }

  return generateTemplatesForCollective(collective.name, params);
}

function generateTemplatesForCollective(
  collectiveName: string,
  params: {
    nextEventTitle?: string;
    nextEventDate?: string;
    nextEventSlug?: string;
  }
): { error: string | null; templates: DMTemplate[] } {
  const nextEvent = params.nextEventTitle ?? "our next event";
  const nextDate = params.nextEventDate ?? "soon";

  const templates: DMTemplate[] = [
    {
      id: "ambassador-reward",
      label: "Ambassador — Reward Offer",
      target: "ambassador",
      subject: `You're one of our top supporters`,
      body: `Hey! You brought friends to our last event and we noticed. We want to reward people like you who help grow ${collectiveName}.\n\nBring 3 more people to ${nextEvent} (${nextDate}) and your ticket is on us. Just share your referral link and we'll track it automatically.\n\nYou're the reason we can keep doing this. Thank you.`,
    },
    {
      id: "ambassador-exclusive",
      label: "Ambassador — Exclusive Access",
      target: "ambassador",
      subject: `Early access — just for you`,
      body: `We're dropping something special for ${nextEvent} and you're getting first look because you've been putting people on to ${collectiveName}.\n\nTickets go live to the public next week, but you can grab yours now. Reply to this and we'll send you the link before anyone else.`,
    },
    {
      id: "repeat-fan-loyalty",
      label: "Repeat Fan — Loyalty",
      target: "repeat_fan",
      subject: `We see you — thanks for coming back`,
      body: `You've been to multiple ${collectiveName} events now and we genuinely appreciate that. You're part of the core crew.\n\nWe've got ${nextEvent} coming up on ${nextDate}. We'd love to see you there again. As a thank you, here's early access before tickets go public.`,
    },
    {
      id: "repeat-fan-referral",
      label: "Repeat Fan — Start Referring",
      target: "repeat_fan",
      subject: `Help us grow — earn free tickets`,
      body: `Since you keep coming back to ${collectiveName} events (and we love that), we want to put you on to our ambassador program.\n\nBring 3 friends to ${nextEvent} using your referral link and your next ticket is free. You clearly know good music — let's spread the word together.`,
    },
    {
      id: "first-timer-welcome",
      label: "First-Timer — Welcome Back",
      target: "first_timer",
      subject: `Hope you had a good time`,
      body: `We saw you came through to one of our events recently — thanks for pulling up.\n\nWe've got ${nextEvent} coming up on ${nextDate} and it's going to be even better. Would love to see you back.\n\nEarly bird tickets are available now. Hope to see you there.`,
    },
    {
      id: "first-timer-urgency",
      label: "First-Timer — FOMO",
      target: "first_timer",
      subject: `${nextEvent} is almost sold out`,
      body: `Hey! You came to one of our ${collectiveName} events and we wanted to make sure you knew about ${nextEvent} on ${nextDate}.\n\nTickets are moving fast. Just wanted to give you a heads up before it sells out. Don't sleep on it.`,
    },
  ];

  return { error: null, templates };
}
