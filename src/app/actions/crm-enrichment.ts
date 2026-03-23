"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const VIP_EVENT_THRESHOLD = 5;
const VIP_SPEND_THRESHOLD = 500;

export async function enrichAttendeeCRM(eventId: string) {
  const admin = createAdminClient();

  try {
    // 1. Get all paid/checked-in tickets for this event
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, user_id, price_paid, metadata")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]);

    if (ticketsError) {
      return { error: `Tickets query failed: ${ticketsError.message}` };
    }

    if (!tickets || tickets.length === 0) {
      return { error: null, enriched: 0 };
    }

    const now = new Date().toISOString();
    let enrichedCount = 0;

    // 2. Process each ticket holder
    for (const ticket of tickets) {
      const userId = ticket.user_id;
      const meta = (ticket.metadata || {}) as Record<string, string>;
      const email = meta.customer_email || null;
      const ticketPrice = Number(ticket.price_paid) || 0;

      if (!userId) continue; // user_id is NOT NULL in schema

      try {
        // Check if profile already exists
        let existingProfile = null;

        if (userId) {
          const { data } = await admin
            .from("attendee_profiles")
            .select("id, total_events, total_spend, first_event_at, vip_status")
            .eq("user_id", userId)
            .maybeSingle();
          existingProfile = data;
        } else if (email) {
          const { data } = await admin
            .from("attendee_profiles")
            .select("id, total_events, total_spend, first_event_at, vip_status")
            .eq("email", email)
            .maybeSingle();
          existingProfile = data;
        }

        if (existingProfile) {
          // Update existing profile
          const newTotalEvents = (existingProfile.total_events ?? 0) + 1;
          const newTotalSpend =
            (Number(existingProfile.total_spend) || 0) + ticketPrice;
          const isVip =
            newTotalEvents >= VIP_EVENT_THRESHOLD ||
            newTotalSpend >= VIP_SPEND_THRESHOLD;

          const { error: updateError } = await admin
            .from("attendee_profiles")
            .update({
              total_events: newTotalEvents,
              total_spend: Math.round(newTotalSpend * 100) / 100,
              last_event_at: now,
              vip_status: isVip,
            })
            .eq("id", existingProfile.id);

          if (updateError) {
            console.error(
              `Failed to update attendee ${existingProfile.id}:`,
              updateError.message
            );
            continue;
          }
        } else {
          // Create new profile
          const isVip =
            1 >= VIP_EVENT_THRESHOLD || ticketPrice >= VIP_SPEND_THRESHOLD;

          const insertData: Record<string, unknown> = {
            total_events: 1,
            total_spend: Math.round(ticketPrice * 100) / 100,
            first_event_at: now,
            last_event_at: now,
            vip_status: isVip,
          };

          if (userId) insertData.user_id = userId;
          if (email) insertData.email = email;

          const { error: insertError } = await admin
            .from("attendee_profiles")
            .insert(insertData);

          if (insertError) {
            console.error(
              `Failed to insert attendee profile for ${userId ?? email}:`,
              insertError.message
            );
            continue;
          }
        }

        enrichedCount++;
      } catch (innerErr) {
        console.error(
          `CRM enrichment error for ticket ${ticket.id}:`,
          innerErr
        );
        continue;
      }
    }

    return { error: null, enriched: enrichedCount };
  } catch (err) {
    console.error("CRM enrichment error:", err);
    return {
      error:
        err instanceof Error ? err.message : "Unexpected CRM enrichment error.",
    };
  }
}
