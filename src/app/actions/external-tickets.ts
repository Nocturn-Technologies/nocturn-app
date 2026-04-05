"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

export interface ExternalTicketData {
  eventId: string;
  platform: string;
  ticketsSold: number;
  revenue: number;
  ticketUrl: string | null;
}

export async function saveExternalTicketData(data: ExternalTicketData): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    if (data.ticketsSold < 0 || data.revenue < 0) {
      return { error: "Numbers cannot be negative" };
    }

    if (data.ticketUrl && !data.ticketUrl.startsWith("https://")) {
      return { error: "Ticket URL must start with https://" };
    }

    const admin = createAdminClient();

    // Verify user owns this event
    const { data: event } = await admin.from("events")
      .select("id, collective_id, metadata")
      .eq("id", data.eventId)
      .maybeSingle();

    if (!event) return { error: "Event not found" };

    const { data: membership } = await admin.from("collective_members")
      .select("id")
      .eq("collective_id", (event as { collective_id: string }).collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Not authorized" };

    // Store in event metadata
    const existingMeta = (event as { metadata: Record<string, unknown> | null }).metadata ?? {};
    const updatedMeta = {
      ...existingMeta,
      external_tickets: {
        platform: data.platform,
        tickets_sold: data.ticketsSold,
        revenue: data.revenue,
        ticket_url: data.ticketUrl,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
    };

    const { error } = await admin.from("events")
      .update({ metadata: updatedMeta })
      .eq("id", data.eventId);

    if (error) return { error: "Something went wrong" };

    revalidatePath(`/dashboard/events/${data.eventId}`);
    return { error: null };
  } catch (err) {
    console.error("[saveExternalTicketData]", err);
    return { error: "Something went wrong" };
  }
}

export async function getExternalTicketData(eventId: string): Promise<{
  platform: string;
  ticketsSold: number;
  revenue: number;
  ticketUrl: string | null;
} | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();

    // Verify collective membership
    const { data: event } = await admin.from("events")
      .select("metadata, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return null;

    const { data: membership } = await admin.from("collective_members")
      .select("id")
      .eq("collective_id", (event as { collective_id: string }).collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return null;

    const meta = (event as { metadata: Record<string, unknown> | null }).metadata;
    const ext = meta?.external_tickets as {
      platform: string;
      tickets_sold: number;
      revenue: number;
      ticket_url: string | null;
    } | undefined;

    if (!ext) return null;

    return {
      platform: ext.platform,
      ticketsSold: ext.tickets_sold,
      revenue: ext.revenue,
      ticketUrl: ext.ticket_url,
    };
  } catch (err) {
    console.error("[getExternalTicketData]", err);
    return null;
  }
}
