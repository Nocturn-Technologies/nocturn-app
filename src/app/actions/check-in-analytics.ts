"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface CheckInAnalytics {
  totalTickets: number;
  checkedIn: number;
  checkInRate: number;
  noShows: number;
  // Velocity: check-ins per 15-minute window
  velocity: { time: string; count: number }[];
  peakTime: string | null;
  // Predictions
  predictedFinalAttendance: number;
  predictedNoShowRate: number;
  // VIP stats
  vipCheckedIn: number;
  vipTotal: number;
  // Time-based
  firstCheckIn: string | null;
  lastCheckIn: string | null;
  avgTimeBetweenCheckIns: number; // seconds
}

export async function getCheckInAnalytics(eventId: string): Promise<CheckInAnalytics> {
  const sb = admin();

  // Get all tickets for this event
  const { data: tickets } = await sb
    .from("tickets")
    .select("id, status, checked_in_at, price_paid, ticket_tier_id, ticket_tiers(name)")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  const allTickets = tickets || [];
  const totalTickets = allTickets.length;
  const checkedInTickets = allTickets.filter((t) => t.status === "checked_in");
  const checkedIn = checkedInTickets.length;
  const noShows = totalTickets - checkedIn;
  const checkInRate = totalTickets > 0 ? checkedIn / totalTickets : 0;

  // Check-in timestamps for velocity calculation
  const checkInTimes = checkedInTickets
    .map((t) => t.checked_in_at)
    .filter(Boolean)
    .map((t) => new Date(t!).getTime())
    .sort((a, b) => a - b);

  // Calculate velocity in 15-minute windows
  const velocity: { time: string; count: number }[] = [];
  if (checkInTimes.length > 0) {
    const firstTime = checkInTimes[0];
    const lastTime = checkInTimes[checkInTimes.length - 1];
    const windowMs = 15 * 60 * 1000; // 15 minutes

    let windowStart = firstTime;
    while (windowStart <= lastTime + windowMs) {
      const windowEnd = windowStart + windowMs;
      const count = checkInTimes.filter((t) => t >= windowStart && t < windowEnd).length;
      velocity.push({
        time: new Date(windowStart).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }),
        count,
      });
      windowStart = windowEnd;
    }
  }

  // Peak time
  const peakWindow = velocity.reduce(
    (max, v) => (v.count > max.count ? v : max),
    { time: "", count: 0 }
  );
  const peakTime = peakWindow.count > 0 ? peakWindow.time : null;

  // Predict final attendance based on current velocity
  let predictedFinalAttendance = checkedIn;
  if (checkedIn > 0 && checkedIn < totalTickets) {
    // Use historical pattern: typically 85-92% of ticket holders check in
    // Adjust based on current rate
    const currentRate = checkInRate;
    if (currentRate > 0.5) {
      // Most people who will come have arrived
      predictedFinalAttendance = Math.round(checkedIn * 1.05);
    } else if (currentRate > 0.2) {
      // Still early, expect more
      predictedFinalAttendance = Math.round(totalTickets * 0.85);
    } else {
      // Very early
      predictedFinalAttendance = Math.round(totalTickets * 0.8);
    }
    predictedFinalAttendance = Math.min(predictedFinalAttendance, totalTickets);
  }

  const predictedNoShowRate = totalTickets > 0
    ? 1 - (predictedFinalAttendance / totalTickets)
    : 0;

  // VIP stats
  const vipTiers = allTickets.filter((t) => {
    const tier = t.ticket_tiers as unknown as { name: string } | null;
    return tier?.name?.toLowerCase().includes("vip");
  });
  const vipTotal = vipTiers.length;
  const vipCheckedIn = vipTiers.filter((t) => t.status === "checked_in").length;

  // Time stats
  const firstCheckIn = checkInTimes.length > 0
    ? new Date(checkInTimes[0]).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;
  const lastCheckIn = checkInTimes.length > 0
    ? new Date(checkInTimes[checkInTimes.length - 1]).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;

  // Average time between check-ins
  let avgTimeBetween = 0;
  if (checkInTimes.length > 1) {
    const diffs: number[] = [];
    for (let i = 1; i < checkInTimes.length; i++) {
      diffs.push((checkInTimes[i] - checkInTimes[i - 1]) / 1000);
    }
    avgTimeBetween = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  }

  return {
    totalTickets,
    checkedIn,
    checkInRate,
    noShows,
    velocity,
    peakTime,
    predictedFinalAttendance,
    predictedNoShowRate,
    vipCheckedIn,
    vipTotal,
    firstCheckIn,
    lastCheckIn,
    avgTimeBetweenCheckIns: Math.round(avgTimeBetween),
  };
}
