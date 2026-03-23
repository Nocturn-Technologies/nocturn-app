import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 bg-nocturn/10" />
        <Skeleton className="h-10 w-36 rounded-md bg-nocturn/10" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-16 w-16 rounded-md bg-nocturn/10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48 bg-muted" />
                <Skeleton className="h-3 w-32 bg-muted" />
                <Skeleton className="h-3 w-24 bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
