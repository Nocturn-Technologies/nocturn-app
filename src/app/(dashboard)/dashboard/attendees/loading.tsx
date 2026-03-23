import { Skeleton } from "@/components/ui/skeleton";

export default function AttendeesLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36 bg-nocturn/10" />
        <Skeleton className="h-10 w-28 rounded-md bg-muted" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Skeleton className="h-8 w-8 rounded-full bg-nocturn/10" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-36 bg-muted" />
              <Skeleton className="h-3 w-48 bg-muted" />
            </div>
            <Skeleton className="h-5 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
