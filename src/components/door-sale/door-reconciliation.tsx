"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoorReconciliation, type DoorReconciliation } from "@/app/actions/door-sale";
import { DollarSign, CreditCard, Gift, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  eventId: string;
  /** Optional ticker to force a reload (bump when a sale completes). */
  reloadToken?: number;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function DoorReconciliationWidget({ eventId, reloadToken }: Props) {
  const [data, setData] = useState<DoorReconciliation | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const result = await getDoorReconciliation(eventId);
    setData(result);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  // Realtime: refresh when door_events changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`door-recon:${eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "door_events", filter: `event_id=eq.${eventId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, load]);

  if (!data) return null;

  const hasAny = data.cardCount + data.cashCount + data.compCount > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors min-h-[48px]"
      >
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-nocturn" />
            <span className="tabular-nums font-medium">{data.cardCount}</span>
            <span className="text-muted-foreground text-xs">card</span>
          </span>
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <span className="tabular-nums font-medium">{fmt(data.cashCents)}</span>
            <span className="text-muted-foreground text-xs">cash</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Gift className="h-4 w-4 text-muted-foreground" />
            <span className="tabular-nums font-medium">{data.compCount}</span>
            <span className="text-muted-foreground text-xs">comp</span>
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {data.overCapacityCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{data.overCapacityCount} sale{data.overCapacityCount > 1 ? "s" : ""} went past tier capacity</span>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">By staff</p>
            {data.byStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              data.byStaff.map((s) => (
                <div key={s.staffUserId} className="flex items-center justify-between text-sm py-1">
                  <span className="truncate">{s.name}</span>
                  <span className="flex gap-3 text-xs tabular-nums">
                    {s.cardCount > 0 && <span className="text-nocturn">{s.cardCount} card</span>}
                    {s.cashCents > 0 && <span className="text-emerald-400">{fmt(s.cashCents)} cash</span>}
                    {s.compCount > 0 && <span className="text-muted-foreground">{s.compCount} comp</span>}
                  </span>
                </div>
              ))
            )}
          </div>

          {data.cashCents > 0 && (
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
              Cash totals shown here are the operator&apos;s responsibility to reconcile. No Nocturn or Stripe fee applies to cash or comp sales.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
