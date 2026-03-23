import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 bg-nocturn/10" />
        <Skeleton className="h-4 w-72 bg-muted" />
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <Skeleton className="h-5 w-24 bg-muted" />
            <Skeleton className="h-8 w-16 bg-nocturn/10" />
            <Skeleton className="h-3 w-32 bg-muted" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 bg-muted" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Skeleton className="h-10 w-10 rounded-md bg-nocturn/10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 bg-muted" />
              <Skeleton className="h-3 w-32 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
