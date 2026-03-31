import { Instagram } from "lucide-react";
import Image from "next/image";


interface CollectiveProfileProps {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  instagram: string | null;
  eventCount: number;
  accentColor: string;
}

export function CollectiveProfile({
  name,
  slug: _slug,
  description,
  logoUrl,
  instagram,
  eventCount,
  accentColor,
}: CollectiveProfileProps) {
  const igHandle = instagram?.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "") || null;

  return (
    <div className="space-y-2">
      <h2 className="font-heading text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20">
        About the collective
      </h2>
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={name}
              width={48}
              height={48}
              unoptimized
              className="h-12 w-12 rounded-full object-cover ring-2 ring-white/10"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ring-2 ring-white/10"
              style={{ backgroundColor: accentColor }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-heading text-base font-semibold text-white">
              {name}
            </p>
            <p className="text-xs text-white/40">
              {eventCount} {eventCount === 1 ? "event" : "events"} hosted
            </p>
          </div>
        </div>

        {/* Bio */}
        {description && (
          <p className="text-sm leading-relaxed text-white/60">
            {description}
          </p>
        )}

        {/* Instagram link */}
        {igHandle && (
          <a
            href={`https://instagram.com/${igHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <Instagram className="h-4 w-4" />
            @{igHandle}
          </a>
        )}
      </div>
    </div>
  );
}
