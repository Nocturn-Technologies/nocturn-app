"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, MapPin, Heart, MessageSquare } from "lucide-react";
import { TYPE_BADGE_COLORS, TYPE_LABELS_SHORT } from "@/lib/marketplace-constants";
import { safeBgUrl } from "@/lib/utils";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ProfileCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onContact: () => void;
  /** Connection labels shown in network view (e.g. "saved", "contacted") */
  connectionTags?: string[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProfileCard({
  profile,
  isSaved,
  onSave,
  onUnsave,
  onContact,
  connectionTags,
}: ProfileCardProps) {
  const type = profile.user_type ?? profile.type ?? "artist";
  const badgeColor = TYPE_BADGE_COLORS[type] ?? "bg-muted text-muted-foreground";
  const typeLabel = TYPE_LABELS_SHORT[type] ?? type;
  const tags: string[] = [
    ...(profile.genres ?? []),
    ...(profile.services ?? []),
  ];
  const shownTags = tags.slice(0, 3);
  const extraCount = Math.max(0, tags.length - 3);

  const hasRate = profile.rate_range;

  return (
    <Card className="overflow-hidden transition-all hover:border-white/[0.15] p-0 group bg-card/50">
      <Link href={`/dashboard/discover/${profile.slug}`} className="block">
        {/* Cover photo area */}
        <div
          className="relative h-24 bg-gradient-to-br from-nocturn/30 via-nocturn/10 to-transparent"
          style={
            profile.cover_photo_url
              ? {
                  backgroundImage: safeBgUrl(profile.cover_photo_url as string),
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {/* Type badge overlaid on cover */}
          <span
            className={`absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badgeColor}`}
          >
            {typeLabel}
          </span>
        </div>

        {/* Content */}
        <div className="px-3 pb-2.5">
          {/* Avatar - overlapping cover and content */}
          <div className="flex items-end -mt-5 mb-1.5">
            <div className="h-10 w-10 shrink-0 rounded-full border-2 border-card bg-nocturn/10 flex items-center justify-center overflow-hidden shadow-md">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <User className="h-4 w-4 text-nocturn/60" />
              )}
            </div>
          </div>

          {/* Name + City row */}
          <h3 className="font-semibold font-heading truncate text-sm leading-tight">
            {profile.display_name}
          </h3>

          {profile.city && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{profile.city}</span>
            </div>
          )}

          {/* Genre / service tags */}
          {shownTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {shownTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {tag.replace(/-/g, " ")}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  +{extraCount}
                </span>
              )}
            </div>
          )}

          {/* Rate range */}
          {hasRate && (
            <p className="mt-1.5 text-xs font-medium text-nocturn">
              {/* rate_range comes in as free text that usually already starts
                  with "$" (see import-profile.ts prompt example "$500-1500").
                  Only prefix "$" ourselves if the string doesn't already have
                  one — otherwise we render "$$500-1500". */}
              {typeof profile.rate_range === "string" && profile.rate_range.trim().startsWith("$")
                ? profile.rate_range
                : `$${profile.rate_range}`}
            </p>
          )}

          {/* Connection tags (network view) */}
          {connectionTags && connectionTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {connectionTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-nocturn/10 px-2 py-0.5 text-[11px] font-medium text-nocturn capitalize"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {/* Bottom action row */}
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <Button
          size="sm"
          className="flex-1 bg-nocturn hover:bg-nocturn-light text-white h-9 min-h-[44px] text-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContact();
          }}
        >
          <MessageSquare className="mr-1.5 h-3 w-3" />
          Contact
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={isSaved ? "Unsave profile" : "Save profile"}
          aria-pressed={isSaved}
          className={`shrink-0 h-9 w-9 min-h-[44px] min-w-[44px] ${
            isSaved
              ? "text-red-400 hover:text-red-300"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            isSaved ? onUnsave() : onSave();
          }}
        >
          <Heart className={`h-3.5 w-3.5 ${isSaved ? "fill-red-400" : ""}`} />
        </Button>
      </div>
    </Card>
  );
}
