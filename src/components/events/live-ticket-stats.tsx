"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  eventId: string;
  initialSold: number;
  initialCapacity: number;
  initialRevenue: number;
  initialCheckedIn: number;
}

export function LiveTicketStats({ eventId, initialSold, initialCapacity, initialRevenue, initialCheckedIn }: Props) {
  const [sold, setSold] = useState(initialSold);
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn);
  const [revenue, _setRevenue] = useState(initialRevenue);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-stats-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `event_id=eq.${eventId}` }, async () => {
        // Refetch counts
        const [{ count: soldCount }, { count: checkedCount }] = await Promise.all([
          supabase.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["paid", "checked_in"]),
          supabase.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "checked_in"),
        ]);
        setSold(soldCount ?? initialSold);
        setCheckedIn(checkedCount ?? initialCheckedIn);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId, initialSold, initialCheckedIn]);

  const pct = initialCapacity > 0 ? Math.round((sold / initialCapacity) * 100) : 0;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Sold:</span>
          <span className="font-semibold text-foreground">{sold} / {initialCapacity}</span>
          <span className="text-zinc-600 text-xs">({pct}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Revenue:</span>
          <span className="font-semibold text-nocturn">
            ${revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      {checkedIn > 0 && sold > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-zinc-500">Checked in:</span>
            <span className="font-semibold text-foreground">{checkedIn} / {sold}</span>
            <span className="text-zinc-600 text-xs">({Math.round((checkedIn / sold) * 100)}%)</span>
          </div>
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((checkedIn / sold) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
