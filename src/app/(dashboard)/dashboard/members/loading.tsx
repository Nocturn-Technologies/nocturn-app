import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32 bg-nocturn/10" />
        <Skeleton className="h-10 w-36 rounded-md bg-nocturn/10" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Skeleton className="h-10 w-10 rounded-full bg-nocturn/10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36 bg-muted" />
              <Skeleton className="h-3 w-24 bg-muted" />
            </div>
            <Skeleton className="h-6 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
