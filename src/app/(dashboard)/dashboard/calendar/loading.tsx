import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <Skeleton className="h-8 w-32 bg-nocturn/10" />

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8 rounded bg-muted" />
        <Skeleton className="h-6 w-36 bg-muted" />
        <Skeleton className="h-8 w-8 rounded bg-muted" />
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-full bg-muted" />
        ))}
      </div>

      {/* 7x5 grid of day cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
