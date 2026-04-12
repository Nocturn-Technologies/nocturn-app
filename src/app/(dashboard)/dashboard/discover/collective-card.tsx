"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  MapPin,
  Calendar,
  MessageSquare,
  Instagram,
  Globe,
} from "lucide-react";
import type { DiscoverCollective } from "@/app/actions/discover-collectives";

interface CollectiveCardProps {
  collective: DiscoverCollective;
  onConnect: () => void;
  isConnecting?: boolean;
  isConnected?: boolean;
}

export function CollectiveCard({
  collective,
  onConnect,
  isConnecting,
  isConnected,
}: CollectiveCardProps) {
  const initials = collective.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="overflow-hidden transition-all hover:border-white/[0.15] p-0 group bg-card/50">
      {/* Header row: logo + name + badge */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-blue-500/10 flex items-center justify-center overflow-hidden ring-1 ring-blue-500/20">
          {collective.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={collective.logo_url}
              alt={collective.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : (
            <span className="text-[11px] font-bold text-blue-400">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate text-sm leading-tight">
            {collective.name}
          </h3>
          {collective.city && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{collective.city}</span>
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-400 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
          Collective
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 px-3 pt-1.5 pb-2.5">
        {/* Description */}
        {collective.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            {collective.description}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{collective.member_count} {collective.member_count === 1 ? "member" : "members"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{collective.event_count} {collective.event_count === 1 ? "event" : "events"}</span>
          </div>
        </div>

        {/* Social links */}
        {(collective.instagram || collective.website) && (
          <div className="flex items-center gap-2">
            {collective.instagram && (
              <a
                href={`https://instagram.com/${collective.instagram.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors"
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
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Bottom action row */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5">
        <Button
          size="sm"
          className={`flex-1 h-9 min-h-[44px] text-xs ${
            isConnected
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-nocturn hover:bg-nocturn-light text-white"
          }`}
          disabled={isConnecting || isConnected}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConnect();
          }}
        >
          <MessageSquare className="mr-1.5 h-3 w-3" />
          {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Connect"}
        </Button>
      </div>
    </Card>
  );
}
