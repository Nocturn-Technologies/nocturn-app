import Link from "next/link";
import Image from "next/image";
import { Calendar } from "lucide-react";

interface PastEvent {
  title: string;
  slug: string;
  flyerUrl: string | null;
  startsAt: string;
}

interface PastEventsProps {
  events: PastEvent[];
  collectiveSlug: string;
  collectiveName: string;
}

export function PastEvents({ events, collectiveSlug, collectiveName }: PastEventsProps) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">
        Previous events by {collectiveName}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
        {events.map((event) => {
          const date = new Date(event.startsAt);
          const dateStr = date.toLocaleDateString("en", {
            month: "short",
            day: "numeric",
          });

          return (
            <Link
              key={event.slug}
              href={`/e/${collectiveSlug}/${event.slug}`}
              className="flex-none group"
            >
              <div className="w-[160px] space-y-2">
                {/* Thumbnail */}
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
                  {event.flyerUrl ? (
                    <Image
                      src={event.flyerUrl}
                      alt={event.title}
                      fill
                      sizes="160px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Calendar className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                </div>
                {/* Title + date */}
                <div>
                  <p className="truncate text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                    {event.title}
                  </p>
                  <p className="text-xs text-white/40">{dateStr}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
