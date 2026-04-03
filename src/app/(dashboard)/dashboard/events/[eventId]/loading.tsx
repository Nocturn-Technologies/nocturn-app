export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 shrink-0 rounded-lg bg-accent animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 rounded-lg bg-accent animate-pulse" />
          <div className="h-4 w-32 rounded bg-accent/60 animate-pulse" />
        </div>
      </div>

      {/* Quick links skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-11 rounded-lg bg-accent animate-pulse"
            style={{ width: `${72 + (i % 3) * 20}px` }}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* Event Details card skeleton */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-nocturn/20 animate-pulse" />
          <div className="h-5 w-28 rounded bg-accent animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-accent/60 animate-pulse" />
            <div className="h-4 w-52 rounded bg-accent animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-accent/60 animate-pulse" />
            <div className="h-4 w-44 rounded bg-accent animate-pulse" />
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-4 w-4 rounded bg-accent/60 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-4 w-36 rounded bg-accent animate-pulse" />
              <div className="h-3 w-48 rounded bg-accent/60 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Tiers card skeleton */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-nocturn/20 animate-pulse" />
          <div className="h-5 w-24 rounded bg-accent animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-accent/30 p-4">
              <div className="space-y-1.5">
                <div className="h-4 w-24 rounded bg-accent animate-pulse" />
                <div className="h-3 w-16 rounded bg-accent/60 animate-pulse" />
              </div>
              <div className="h-6 w-14 rounded bg-accent animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
