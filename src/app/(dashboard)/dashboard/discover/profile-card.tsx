"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, MapPin, Heart, MessageSquare } from "lucide-react";
import { TYPE_BADGE_COLORS, TYPE_LABELS_SHORT } from "@/lib/marketplace-constants";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ProfileCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onContact: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProfileCard({
  profile,
  isSaved,
  onSave,
  onUnsave,
  onContact,
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

  const rateMin = profile.rate_min ?? profile.rate_range?.split?.("-")?.[0];
  const rateMax = profile.rate_max ?? profile.rate_range?.split?.("-")?.[1];
  const hasRate = rateMin || rateMax || profile.rate_range;

  return (
    <Card className="overflow-hidden transition-all hover:border-white/[0.12] p-0 group">
      <Link href={`/dashboard/discover/${profile.slug}`} className="block">
        {/* Cover photo area */}
        <div
          className="relative h-28 bg-gradient-to-br from-nocturn/20 to-nocturn/5"
          style={
            profile.cover_photo_url
              ? {
                  backgroundImage: `url(${profile.cover_photo_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />

        {/* Content */}
        <div className="px-3 pb-3">
          {/* Avatar - overlapping cover and content */}
          <div className="flex items-end -mt-6 mb-2">
            <div className="h-12 w-12 shrink-0 rounded-full border-2 border-card bg-nocturn/10 flex items-center justify-center overflow-hidden">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-nocturn/60" />
              )}
            </div>
          </div>

          {/* Display name */}
          <h3 className="font-medium truncate text-sm leading-tight">
            {profile.display_name}
          </h3>

          {/* Type badge */}
          <div className="mt-1.5">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeColor}`}
            >
              {typeLabel}
            </span>
          </div>

          {/* City */}
          {profile.city && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{profile.city}</span>
            </div>
          )}

          {/* Genre / service tags */}
          {shownTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {shownTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag.replace(/-/g, " ")}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{extraCount}
                </span>
              )}
            </div>
          )}

          {/* Rate range */}
          {hasRate && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {profile.rate_range
                ? `$${profile.rate_range}`
                : rateMin && rateMax
                ? `$${rateMin} - $${rateMax}`
                : rateMin
                ? `From $${rateMin}`
                : `Up to $${rateMax}`}
            </p>
          )}
        </div>
      </Link>

      {/* Bottom action row - outside the Link */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <Button
          size="sm"
          className="flex-1 bg-nocturn hover:bg-nocturn-light text-white min-h-[44px] text-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContact();
          }}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Contact
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className={`shrink-0 min-h-[44px] min-w-[44px] ${
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
          <Heart className={`h-4 w-4 ${isSaved ? "fill-red-400" : ""}`} />
        </Button>
      </div>
    </Card>
  );
}
