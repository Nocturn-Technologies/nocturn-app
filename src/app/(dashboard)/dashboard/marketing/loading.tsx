import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24 bg-nocturn/10" />
        <Skeleton className="h-4 w-56 bg-muted" />
      </div>
      <div className="rounded-lg border border-nocturn/20 p-6 space-y-3">
        <Skeleton className="h-12 w-12 rounded-xl bg-nocturn/10" />
        <Skeleton className="h-5 w-36 bg-muted" />
        <Skeleton className="h-4 w-72 bg-muted" />
        <Skeleton className="h-10 w-40 rounded-md bg-nocturn/10" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-5 w-24 bg-muted" />
            <Skeleton className="h-3 w-40 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
