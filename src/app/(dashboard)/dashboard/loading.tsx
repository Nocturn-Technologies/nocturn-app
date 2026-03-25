import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Greeting */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64 bg-nocturn/10 rounded-lg" />
          <Skeleton className="h-6 w-6 rounded-full bg-nocturn/10" />
        </div>
        <Skeleton className="h-4 w-80 max-w-full bg-muted/60 rounded-md" />
      </div>

      {/* Quick action pills */}
      <div className="flex gap-2.5 overflow-hidden">
        {[120, 100, 96, 104].map((w, i) => (
          <Skeleton
            key={i}
            className="h-[44px] shrink-0 rounded-full bg-nocturn/[0.06] border border-nocturn/10"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>

      {/* Bento grid: Financial Pulse (wide) + Stats (narrow) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Financial Pulse */}
        <div className="md:col-span-2 rounded-xl border border-white/[0.06] p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl bg-nocturn/10" />
            <Skeleton className="h-4 w-32 bg-muted/60 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 bg-nocturn/10 rounded-md" />
          <div className="flex items-end gap-1.5 h-12">
            {[32, 24, 40, 20, 36].map((h, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-md bg-muted/40"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <Skeleton className="h-3 w-40 bg-muted/40 rounded-md" />
        </div>

        {/* Stats column */}
        <div className="grid grid-cols-3 md:grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.06] p-4 flex flex-col items-center gap-2 md:flex-row md:gap-3"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl bg-nocturn/10" />
              <div className="space-y-1.5 text-center md:text-left">
                <Skeleton className="h-3 w-16 bg-muted/60 rounded-md" />
                <Skeleton className="h-6 w-10 bg-muted/40 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Smart Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-white/[0.06] p-4 flex items-start gap-3"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl bg-nocturn/10" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32 bg-muted/60 rounded-md" />
              <Skeleton className="h-3 w-48 max-w-full bg-muted/40 rounded-md" />
            </div>
            <Skeleton className="h-4 w-4 shrink-0 bg-muted/40 rounded" />
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="rounded-xl border border-white/[0.06] border-l-4 border-l-nocturn/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded bg-nocturn/10" />
          <Skeleton className="h-4 w-28 bg-muted/60 rounded-md" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-start gap-2 px-2">
            <Skeleton className="h-3.5 w-3.5 shrink-0 mt-0.5 rounded bg-nocturn/10" />
            <Skeleton className="h-4 w-full max-w-xs bg-muted/40 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
