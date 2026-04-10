"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/database.types";

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
  try {
    if (!eventId?.trim()) return { error: "Event ID is required", config: DEFAULT_CONFIG };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", config: DEFAULT_CONFIG };

    const admin = createAdminClient();

    // Verify user has access to this event
    const { data: eventRaw, error: eventError } = await admin
      .from("events")
      .select("metadata, collective_id")
      .eq("id", eventId)
      .maybeSingle();
    const event = eventRaw as { metadata: Record<string, unknown> | null; collective_id: string } | null;

    if (eventError) {
      console.error("[getAmbassadorConfig] event lookup failed:", eventError);
      return { error: "Something went wrong", config: DEFAULT_CONFIG };
    }
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
  } catch (err) {
    console.error("[getAmbassadorConfig]", err);
    return { error: "Something went wrong", config: DEFAULT_CONFIG };
  }
}

// ── Save ambassador config for an event ──

export async function saveAmbassadorConfig(
  eventId: string,
  config: AmbassadorConfig
): Promise<{ error: string | null }> {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required" };
    if (!config) return { error: "Config is required" };

    // ── Shape validation: build a clean persisted object, reject unknown shapes ──
    // Aligned with the AmbassadorConfig interface above.
    const ALLOWED_REWARD_TYPES = ["free_ticket", "discount", "custom"] as const;
    const rawConfig = config as unknown as Record<string, unknown>;

    if (typeof rawConfig.enabled !== "boolean") {
      return { error: "Invalid ambassador config" };
    }
    if (!Array.isArray(rawConfig.rules) || rawConfig.rules.length > 20) {
      return { error: "Invalid ambassador config" };
    }
    const cleanRules: AmbassadorRewardRule[] = [];
    for (const rule of rawConfig.rules as unknown[]) {
      if (!rule || typeof rule !== "object") {
        return { error: "Invalid ambassador config" };
      }
      const r = rule as Record<string, unknown>;
      if (
        !Number.isInteger(r.threshold) ||
        (r.threshold as number) < 1 ||
        (r.threshold as number) > 1000
      ) {
        return { error: "Invalid ambassador config" };
      }
      if (
        typeof r.rewardType !== "string" ||
        !ALLOWED_REWARD_TYPES.includes(r.rewardType as typeof ALLOWED_REWARD_TYPES[number])
      ) {
        return { error: "Invalid ambassador config" };
      }
      if (typeof r.rewardValue !== "string") {
        return { error: "Invalid ambassador config" };
      }
      const trimmedRewardValue = r.rewardValue.trim();
      if (trimmedRewardValue.length > 200) {
        return { error: "Invalid ambassador config" };
      }
      if (typeof r.active !== "boolean") {
        return { error: "Invalid ambassador config" };
      }
      const ruleId =
        typeof r.id === "string" && r.id.trim().length > 0 && r.id.length <= 100
          ? r.id.trim()
          : `rule-${cleanRules.length}`;
      cleanRules.push({
        id: ruleId,
        threshold: r.threshold as number,
        rewardType: r.rewardType as AmbassadorRewardRule["rewardType"],
        rewardValue: trimmedRewardValue,
        active: r.active,
      });
    }
    if (typeof rawConfig.defaultMessage !== "string") {
      return { error: "Invalid ambassador config" };
    }
    const cleanDefaultMessage = rawConfig.defaultMessage.trim();
    if (cleanDefaultMessage.length > 500) {
      return { error: "Invalid ambassador config" };
    }

    const cleanConfig: AmbassadorConfig = {
      enabled: rawConfig.enabled,
      rules: cleanRules,
      defaultMessage: cleanDefaultMessage,
    };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();

    // Get current metadata + verify ownership
    const { data: eventRaw2, error: eventError2 } = await admin
      .from("events")
      .select("metadata, collective_id")
      .eq("id", eventId)
      .maybeSingle();
    const event2 = eventRaw2 as { metadata: Record<string, unknown> | null; collective_id: string } | null;

    if (eventError2) {
      console.error("[saveAmbassadorConfig] event lookup failed:", eventError2);
      return { error: "Something went wrong" };
    }
    if (!event2) return { error: "Event not found" };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event2.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount || memberCount === 0) return { error: "Not authorized" };

    const currentMetadata = (event2.metadata ?? {}) as Record<string, unknown>;

    // Merge ambassador_config into existing metadata (clean shape only)
    const updatedMetadata = {
      ...currentMetadata,
      ambassador_config: cleanConfig,
    };

    const { error } = await admin.from("events").update({ metadata: updatedMetadata as unknown as { [key: string]: Json | undefined } })
      .eq("id", eventId);

    if (error) return { error: "Failed to save ambassador config" };

    revalidatePath("/dashboard/events");
    return { error: null };
  } catch (err) {
    console.error("[saveAmbassadorConfig]", err);
    return { error: "Something went wrong" };
  }
}

