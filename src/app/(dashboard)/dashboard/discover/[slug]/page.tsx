import { safeBgUrl } from "@/lib/utils";
import { getProfileBySlug } from "@/app/actions/marketplace";
import { getProfilePerformanceWithCollective } from "@/app/actions/marketplace-analytics";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  User,
  MapPin,
  CheckCircle,
  ArrowLeft,
  ExternalLink,
  Instagram,
  Music,
  Globe,
  BarChart3,
  Calendar,
} from "lucide-react";
import { TYPE_BADGE_COLORS, TYPE_LABELS } from "@/lib/marketplace-constants";
import { ProfileActions } from "./profile-actions";

// ─── Helper ─────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Page component ─────────────────────────────────────────────────────────

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getProfileBySlug(slug);

  if (!profile) {
    notFound();
  }

  const type = profile.user_type ?? "artist";

  // Fetch performance analytics (only meaningful for artist-type profiles)
  const performance =
    type === "artist" && profile.user_id
      ? await getProfilePerformanceWithCollective(profile.user_id)
      : null;
  const badgeColor = TYPE_BADGE_COLORS[type] ?? "bg-muted text-muted-foreground";
  const typeLabel = TYPE_LABELS[type] ?? type;

  const tags: string[] = [
    ...(profile.genres ?? []),
    ...(profile.services ?? []),
  ];

  const socialLinks = [
    {
      url: profile.instagram_handle
        ? `https://instagram.com/${profile.instagram_handle.replace(/^@/, "")}`
        : null,
      label: "Instagram",
      icon: Instagram,
    },
    {
      url: profile.soundcloud_url,
      label: "SoundCloud",
      icon: Music,
    },
    {
      url: profile.spotify_url,
      label: "Spotify",
      icon: Music,
    },
    {
      url: profile.website_url,
      label: "Website",
      icon: Globe,
    },
  ].filter((s) => s.url);

  const portfolioUrls: string[] = profile.portfolio_urls ?? [];
  const pastVenues: string[] = profile.past_venues ?? [];

  return (
    <div className="space-y-6 overflow-x-hidden pb-6">
      {/* Back button */}
      <div className="px-4 md:px-0">
        <Link
          href="/dashboard/discover"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Discover
        </Link>
      </div>

      {/* Cover photo */}
      <div
        className="relative h-48 bg-gradient-to-br from-nocturn/20 to-nocturn/5 -mx-4 md:mx-0 md:rounded-xl overflow-hidden"
        style={
          profile.cover_photo_url
            ? {
                backgroundImage: safeBgUrl(profile.cover_photo_url),
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />

      {/* Avatar + header info */}
      <div className="px-4 md:px-0 -mt-10 relative z-10">
        <div className="flex items-end gap-4">
          {/* Avatar */}
          <div className="h-20 w-20 shrink-0 rounded-full border-4 border-card bg-nocturn/10 flex items-center justify-center overflow-hidden">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-nocturn/60" />
            )}
          </div>
        </div>

        {/* Display name + verified */}
        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-2xl font-bold">{profile.display_name}</h1>
          {profile.is_verified && (
            <CheckCircle className="h-5 w-5 text-blue-400 fill-blue-400/20" />
          )}
        </div>

        {/* Type badge + city */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${badgeColor}`}
          >
            {typeLabel}
          </span>
          {profile.city && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {profile.city}
            </span>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="px-4 md:px-0">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Genre / service tags */}
      {tags.length > 0 && (
        <div className="px-4 md:px-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {type === "artist" ? "Genres" : "Services"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-foreground"
              >
                {tag.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rate range */}
      {profile.rate_range && (
        <div className="px-4 md:px-0">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Rate
              </h3>
              <p className="text-lg font-semibold">
                {profile.rate_range}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Availability */}
      {profile.availability && (
        <div className="px-4 md:px-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Availability
          </h3>
          <p className="text-sm text-foreground">{profile.availability}</p>
        </div>
      )}

      {/* Social links */}
      {socialLinks.length > 0 && (
        <div className="px-4 md:px-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-2">
            {socialLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.label}
                  href={link.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-foreground hover:bg-white/[0.04] transition-colors min-h-[44px]"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Portfolio */}
      {portfolioUrls.length > 0 && (
        <div className="px-4 md:px-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Portfolio
          </h3>
          <div className="space-y-2">
            {portfolioUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/[0.08] px-4 py-3 text-sm text-foreground hover:bg-white/[0.04] transition-colors min-h-[44px]"
              >
                <span className="truncate">{getDomain(url)}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Past venues */}
      {pastVenues.length > 0 && (
        <div className="px-4 md:px-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Past Venues
          </h3>
          <p className="text-sm text-muted-foreground">
            {pastVenues.join(", ")}
          </p>
        </div>
      )}

      {/* Performance with your collective */}
      {performance && (
        <div className="px-4 md:px-0">
          <Card className="border-nocturn/20 bg-nocturn/[0.03]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-nocturn" />
                <h3 className="text-sm font-semibold">
                  Performance with your collective
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {performance.totalEvents}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Events
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {performance.totalTickets}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Tickets Sold
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">
                    {performance.avgPerEvent}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Avg / Event
                  </div>
                </div>
              </div>
              {performance.lastBooked && (
                <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Last booked:{" "}
                    <span className="text-foreground">
                      {performance.lastBookedTitle ?? "Event"}
                    </span>{" "}
                    on{" "}
                    {new Date(performance.lastBooked).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action buttons (client component) */}
      <div className="px-4 md:px-0">
        <ProfileActions
          profileId={profile.id}
          profileName={profile.display_name}
        />
      </div>
    </div>
  );
}
