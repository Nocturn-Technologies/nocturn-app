import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 bg-nocturn/10" />
        <Skeleton className="h-10 w-36 rounded-md bg-nocturn/10" />
      </div>

      {/* Section 1: Upcoming */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40 bg-muted" />
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-5 w-48 bg-nocturn/10" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-28 bg-muted" />
              <Skeleton className="h-5 w-16 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>

      {/* Section 2: Past */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32 bg-muted" />
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-5 w-48 bg-nocturn/10" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-28 bg-muted" />
              <Skeleton className="h-5 w-16 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
