import { Card, CardContent } from "@/components/ui/card";

export default function AttendeesLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-52 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-muted animate-pulse shrink-0" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-6 w-14 rounded bg-muted animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="p-4">
              <div className="hidden sm:grid grid-cols-12 items-center gap-2">
                <div className="col-span-4 space-y-1.5">
                  <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-28 rounded bg-muted animate-pulse" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <div className="h-4 w-6 rounded bg-muted animate-pulse" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <div className="h-4 w-6 rounded bg-muted animate-pulse" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="sm:hidden space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-14 rounded bg-muted animate-pulse" />
                </div>
                <div className="flex gap-4">
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
