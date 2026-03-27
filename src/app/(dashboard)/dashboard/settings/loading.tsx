import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <Skeleton className="h-8 w-28 bg-nocturn/10" />

      {/* Profile section */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <Skeleton className="h-5 w-20 bg-muted" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full bg-nocturn/10" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-10 w-full rounded-md bg-muted" />
            <Skeleton className="h-10 w-full rounded-md bg-muted" />
          </div>
        </div>
      </div>

      {/* Collective section */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <Skeleton className="h-5 w-28 bg-muted" />
        <Skeleton className="h-10 w-full rounded-md bg-muted" />
        <Skeleton className="h-10 w-full rounded-md bg-muted" />
        <Skeleton className="h-10 w-full rounded-md bg-muted" />
      </div>
    </div>
  );
}
