import { Skeleton } from "@/components/ui/skeleton";

export default function ArtistsLoading() {
  return (
    <div className="space-y-6 p-4 animate-in fade-in duration-300 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28 bg-nocturn/10" />
        <Skeleton className="h-10 w-32 rounded-xl bg-nocturn/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full bg-nocturn/10 shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-5 w-28 bg-muted" />
                <Skeleton className="h-3 w-20 bg-muted" />
              </div>
            </div>
            <Skeleton className="h-3 w-full bg-muted" />
            <Skeleton className="h-3 w-3/4 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
