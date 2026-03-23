export default function EventPageLoading() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Flyer skeleton */}
        <div className="aspect-square w-full animate-pulse rounded-xl bg-[#18181B]" />
        {/* Title */}
        <div className="space-y-2">
          <div className="h-8 w-3/4 animate-pulse rounded bg-[#18181B]" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-[#18181B]" />
        </div>
        {/* Tickets */}
        <div className="space-y-3">
          <div className="h-5 w-20 animate-pulse rounded bg-[#18181B]" />
          {[1, 2].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-[#18181B]" />
          ))}
        </div>
      </div>
    </div>
  );
}
