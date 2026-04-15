"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Users,
  MapPin,
  Calendar,
  MessageSquareHeart,
  Instagram,
  Globe,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { DiscoverCollective } from "@/app/actions/discover-collectives";

interface CollectiveCardProps {
  collective: DiscoverCollective;
  onPitchCollab: () => void;
  isConnecting?: boolean;
  isConnected?: boolean;
  /** If the viewer isn't a collective member, they can't pitch a collab. */
  canPitch?: boolean;
}

function formatRelativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffDays = Math.round((d.getTime() - now) / (24 * 60 * 60 * 1000));
  if (diffDays >= 0) {
    if (diffDays === 0) return "tonight";
    if (diffDays === 1) return "tomorrow";
    if (diffDays < 14) return `in ${diffDays}d`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const ago = -diffDays;
  if (ago < 7) return `${ago}d ago`;
  if (ago < 60) return `${Math.round(ago / 7)}w ago`;
  if (ago < 365) return `${Math.round(ago / 30)}mo ago`;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function CollectiveCard({
  collective,
  onPitchCollab,
  isConnecting,
  isConnected,
  canPitch = true,
}: CollectiveCardProps) {
  const initials = collective.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const hasFlyer = !!collective.latest_flyer_url;
  const dateLabel = formatRelativeDate(collective.latest_event_date);
  const isActive = collective.recent_events_count > 0;

  return (
    <Card className="overflow-hidden p-0 group relative bg-card/50 hover:border-nocturn/30 transition-all duration-200">
      {/* Flyer-forward header */}
      <Link
        href={`/dashboard/discover/c/${collective.slug}`}
        className="block relative h-36 bg-gradient-to-br from-nocturn/30 via-nocturn/10 to-background overflow-hidden"
      >
        {hasFlyer ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={collective.latest_flyer_url as string}
            alt={collective.latest_event_title ?? collective.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-black font-heading text-nocturn/30 tracking-tight">
              {initials}
            </span>
          </div>
        )}
        {/* Gradient overlay for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Freshness chip (top-left) */}
        {isActive && (
          <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-sm px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-300">
              {collective.recent_events_count} event{collective.recent_events_count === 1 ? "" : "s"} · 60d
            </span>
          </div>
        )}

        {/* Badge (top-right) */}
        <span className="absolute top-3 right-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/90 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
          Collective
        </span>

        {/* Latest event caption (bottom) */}
        {hasFlyer && collective.latest_event_title && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 min-w-0">
            <Sparkles className="h-3 w-3 shrink-0 text-white/60" />
            <span className="text-[11px] text-white/90 truncate font-medium">
              {collective.latest_event_title}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </span>
          </div>
        )}
      </Link>

      {/* Identity row */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <div className="h-8 w-8 shrink-0 rounded-full bg-nocturn/10 flex items-center justify-center overflow-hidden ring-1 ring-nocturn/20">
          {collective.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={collective.logo_url}
              alt={collective.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-bold text-nocturn">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/discover/c/${collective.slug}`}
            className="block"
          >
            <h3 className="font-semibold font-heading truncate text-sm leading-tight hover:text-nocturn transition-colors">
              {collective.name}
            </h3>
            {collective.city && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{collective.city}</span>
              </div>
            )}
          </Link>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {collective.instagram && (
            <a
              href={`https://instagram.com/${collective.instagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              aria-label="Instagram"
            >
              <Instagram className="h-3.5 w-3.5" />
            </a>
          )}
          {collective.website && (
            <a
              href={collective.website.startsWith("http") ? collective.website : `https://${collective.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              aria-label="Website"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-3 pt-2">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>
            {collective.member_count} {collective.member_count === 1 ? "member" : "members"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>
            {collective.event_count} {collective.event_count === 1 ? "event" : "events"}
          </span>
        </div>
      </div>

      {/* Pitch a collab CTA */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-3">
        <Button
          size="sm"
          className={`flex-1 min-h-[44px] text-xs font-semibold ${
            isConnected
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-nocturn hover:bg-nocturn-light text-white"
          }`}
          disabled={isConnecting || isConnected || !canPitch}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canPitch) onPitchCollab();
          }}
          title={!canPitch ? "Join or create a collective to pitch collabs" : undefined}
        >
          {isConnected ? (
            <>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Pitched
            </>
          ) : isConnecting ? (
            "Starting chat..."
          ) : (
            <>
              <MessageSquareHeart className="mr-1.5 h-3.5 w-3.5" />
              Pitch a collab
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
