import Link from "next/link";

interface NearbyEvent {
  title: string;
  slug: string;
  collectiveSlug: string;
  collectiveName: string;
  startsAt: string;
  flyerUrl: string | null;
  venueName: string | null;
  venueCity: string | null;
}

export function AlsoThisWeek({ events }: { events: NearbyEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section className="border-t border-white/5 bg-[#09090B] px-6 py-10">
      <div className="mx-auto max-w-[640px]">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white/30 mb-5">
          Also happening in Toronto
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
          {events.map((event) => {
            const date = new Date(event.startsAt);
            const dayName = date.toLocaleDateString("en", { weekday: "short" });
            const monthDay = date.toLocaleDateString("en", { month: "short", day: "numeric" });

            return (
              <Link
                key={`${event.collectiveSlug}/${event.slug}`}
                href={`/e/${event.collectiveSlug}/${event.slug}`}
                className="group shrink-0 w-[200px] rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden hover:border-white/10 transition-all"
              >
                {/* Flyer or placeholder */}
                <div className="aspect-[4/3] bg-white/[0.03] relative overflow-hidden">
                  {event.flyerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.flyerUrl}
                      alt={event.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-white/10">🌙</div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-1">
                  <p className="text-xs text-white/40">
                    {dayName} {monthDay}
                    {event.venueName && <span> · {event.venueName}</span>}
                  </p>
                  <p className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                    {event.title}
                  </p>
                  <p className="text-[11px] text-white/25">
                    by {event.collectiveName}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
