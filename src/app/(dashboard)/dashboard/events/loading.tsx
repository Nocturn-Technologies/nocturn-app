import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function EventCardSkeleton() {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-4 p-4 min-h-[72px]">
        <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function SectionSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 min-h-[44px] px-2">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-6 rounded-full" />
        <Skeleton className="ml-auto h-4 w-4" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: cards }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function EventsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 overflow-x-hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28 shrink-0 rounded-md" />
      </div>

      <SectionSkeleton cards={3} />
      <SectionSkeleton cards={2} />
    </div>
  );
}
