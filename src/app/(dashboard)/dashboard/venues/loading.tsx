import { Skeleton } from "@/components/ui/skeleton";

export default function VenuesLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 bg-nocturn/10" />
        <Skeleton className="h-10 w-24 rounded-md bg-muted" />
      </div>
      <Skeleton className="h-10 w-full rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-32 w-full rounded-md bg-nocturn/10" />
            <Skeleton className="h-5 w-36 bg-muted" />
            <Skeleton className="h-3 w-48 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
