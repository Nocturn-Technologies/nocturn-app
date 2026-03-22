"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Users,
  MapPin,
  Ticket,
  CheckSquare,
  DollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EventCardData {
  id: string;
  event_id: string;
  channel_id: string;
  lineup: { name: string; role?: string }[] | null;
  venue_deal: {
    venue?: string;
    terms?: string;
    rental_fee?: string;
  } | null;
  ticket_pricing: {
    tier?: string;
    price?: number;
    quantity?: number;
  }[] | null;
  action_items: {
    task: string;
    assignee?: string;
    done?: boolean;
  }[] | null;
  financials: {
    estimated_revenue?: number;
    estimated_costs?: number;
    estimated_profit?: number;
  } | null;
  last_updated_at: string;
}

interface EventCardLiveProps {
  channelId: string;
  eventId: string;
}

export function EventCardLive({ channelId, eventId }: EventCardLiveProps) {
  const supabase = createClient();
  const [card, setCard] = useState<EventCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase
      .from("event_cards")
      .select("*")
      .eq("channel_id", channelId)
      .eq("event_id", eventId)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCard(data[0] as EventCardData);
        }
        setLoading(false);
      });
  }, [channelId, eventId, supabase]);

  if (loading) return null;

  const isEmpty =
    !card ||
    (!card.lineup?.length &&
      !card.venue_deal?.venue &&
      !card.ticket_pricing?.length &&
      !card.action_items?.length &&
      !card.financials?.estimated_revenue);

  return (
    <div className="mx-3 mt-2 mb-1 rounded-2xl border border-nocturn/30 bg-card overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-nocturn" />
          <span className="text-sm font-semibold">Event Card</span>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={18} className="text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground/60 text-center py-3">
              Chat about your event to fill this in
            </p>
          ) : (
            <>
              {/* Lineup */}
              {card?.lineup && card.lineup.length > 0 && (
                <CardSection icon={Users} title="Lineup">
                  <div className="space-y-1">
                    {card.lineup.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-foreground">{a.name}</span>
                        {a.role && (
                          <span className="text-muted-foreground">
                            ({a.role})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardSection>
              )}

              {/* Venue Deal */}
              {card?.venue_deal?.venue && (
                <CardSection icon={MapPin} title="Venue & Deal">
                  <p className="text-xs text-foreground">
                    {card.venue_deal.venue}
                  </p>
                  {card.venue_deal.terms && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {card.venue_deal.terms}
                    </p>
                  )}
                  {card.venue_deal.rental_fee && (
                    <p className="text-xs text-nocturn mt-0.5">
                      Fee: {card.venue_deal.rental_fee}
                    </p>
                  )}
                </CardSection>
              )}

              {/* Ticket Pricing */}
              {card?.ticket_pricing && card.ticket_pricing.length > 0 && (
                <CardSection icon={Ticket} title="Pricing">
                  <div className="space-y-1">
                    {card.ticket_pricing.map((t, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-foreground">
                          {t.tier ?? "General"}
                        </span>
                        <span className="text-nocturn">
                          ${t.price ?? 0} x {t.quantity ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardSection>
              )}

              {/* Action Items */}
              {card?.action_items && card.action_items.length > 0 && (
                <CardSection icon={CheckSquare} title="Action Items">
                  <div className="space-y-1.5">
                    {card.action_items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border shrink-0 mt-0.5 ${
                            item.done
                              ? "bg-nocturn border-nocturn"
                              : "border-muted-foreground"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={
                              item.done
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }
                          >
                            {item.task}
                          </span>
                          {item.assignee && (
                            <span className="text-muted-foreground ml-1">
                              — {item.assignee}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardSection>
              )}

              {/* Financials */}
              {card?.financials?.estimated_revenue != null && (
                <CardSection icon={DollarSign} title="Financial Estimates">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="text-green-400">
                        $
                        {card.financials.estimated_revenue?.toLocaleString()}
                      </span>
                    </div>
                    {card.financials.estimated_costs != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Costs</span>
                        <span className="text-red-400">
                          $
                          {card.financials.estimated_costs.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {card.financials.estimated_profit != null && (
                      <div className="flex justify-between border-t border-border pt-1">
                        <span className="text-muted-foreground">Profit</span>
                        <span
                          className={
                            card.financials.estimated_profit >= 0
                              ? "text-green-400 font-medium"
                              : "text-red-400 font-medium"
                          }
                        >
                          $
                          {card.financials.estimated_profit.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardSection>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CardSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl bg-accent/50 p-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full"
      >
        <Icon size={14} className="text-nocturn" />
        <span className="text-xs font-semibold flex-1 text-left">{title}</span>
        {open ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
