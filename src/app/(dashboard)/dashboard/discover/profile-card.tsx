"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { User, MapPin, Bookmark, MessageSquare, CheckCircle2 } from "lucide-react";
import { TYPE_LABELS_SHORT } from "@/lib/marketplace-constants";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ProfileCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onContact: () => void;
  /** Optional connection labels shown in network view. */
  connectionTags?: string[];
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
  const typeLabel = TYPE_LABELS_SHORT[type] ?? type;

  const tags: string[] = [
    ...(profile.genres ?? []),
    ...(profile.services ?? []),
  ];
  const shownTags = tags.slice(0, 2);
  const extraCount = Math.max(0, tags.length - 2);
  const initials =
    (profile.display_name as string)
      ?.split(/\s+/)
      .slice(0, 2)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase() ?? "·";

  return (
    <Card
      className={`relative overflow-hidden p-0 group bg-card/40 transition-all duration-200 ${
        isSaved
          ? "border-nocturn/40 ring-1 ring-nocturn/20"
          : "hover:border-white/[0.12]"
      }`}
    >
      {isSaved && (
        <div className="absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded-full bg-nocturn/15 border border-nocturn/30 px-2 py-0.5 text-[11px] font-semibold text-nocturn backdrop-blur-sm">
          <CheckCircle2 className="h-3 w-3" />
          Saved
        </div>
      )}

      <Link
        href={`/dashboard/discover/${profile.slug}`}
        className="flex items-start gap-3 p-3"
      >
        {/* Avatar — the primary visual for people profiles */}
        <div className="h-14 w-14 md:h-16 md:w-16 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-nocturn/25 to-nocturn/5 flex items-center justify-center ring-1 ring-white/[0.06]">
          {profile.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-sm font-bold font-heading text-nocturn/80">
              {initials}
            </span>
          )}
        </div>

        {/* Identity + role + location */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold font-heading text-sm leading-tight text-foreground truncate min-w-0">
              {profile.display_name}
            </h3>
            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
              {typeLabel}
            </span>
          </div>

          {profile.city && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{profile.city}</span>
            </div>
          )}

          {shownTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 min-w-0">
              {shownTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-muted-foreground max-w-full truncate"
                >
                  {tag.replace(/-/g, " ")}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="inline-block rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Action row — understated, not a second block of purple */}
      <div className="flex items-center gap-1 px-3 pb-3 pt-0">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContact();
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border border-nocturn/30 bg-nocturn/10 hover:bg-nocturn/20 hover:border-nocturn/50 text-nocturn text-xs font-semibold transition-all px-3 active:scale-[0.98]"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Message
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isSaved) onUnsave();
            else onSave();
          }}
          aria-label={isSaved ? "Unsave profile" : "Save profile"}
          aria-pressed={isSaved}
          className={`shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border transition-all active:scale-[0.92] ${
            isSaved
              ? "border-nocturn/40 bg-nocturn/15 text-nocturn hover:bg-nocturn/25"
              : "border-white/[0.08] bg-transparent text-muted-foreground hover:text-foreground hover:border-white/[0.15]"
          }`}
        >
          <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-nocturn" : ""}`} />
        </button>
      </div>
    </Card>
  );
}
