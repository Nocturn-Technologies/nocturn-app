import { Skeleton } from "@/components/ui/skeleton";

export default function ArtistsLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28 bg-nocturn/10" />
        <Skeleton className="h-10 w-32 rounded-md bg-nocturn/10" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-12 w-12 rounded-full bg-nocturn/10" />
            <Skeleton className="h-5 w-28 bg-muted" />
            <Skeleton className="h-3 w-20 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
