import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <Skeleton className="h-8 w-32 bg-nocturn/10" />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <Skeleton className="h-4 w-24 bg-muted" />
            <Skeleton className="h-7 w-20 bg-nocturn/10" />
            <Skeleton className="h-3 w-32 bg-muted" />
          </div>
        ))}
      </div>

      {/* Event breakdowns */}
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40 bg-nocturn/10" />
            <Skeleton className="h-4 w-20 bg-muted" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-muted" />
            <Skeleton className="h-3 w-3/4 bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
