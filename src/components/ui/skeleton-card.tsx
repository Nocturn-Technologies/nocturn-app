export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-card/60 backdrop-blur-sm ring-1 ring-white/[0.06] p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-nocturn/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-nocturn/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
          </div>
          <div className="h-3 w-1/3 rounded bg-nocturn/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
          </div>
        </div>
      </div>
      <div className="h-3 w-full rounded bg-nocturn/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
      </div>
      <div className="h-3 w-4/5 rounded bg-nocturn/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
      </div>
    </div>
  );
}

export function SkeletonEventCard() {
  return (
    <div className="rounded-2xl bg-card/60 backdrop-blur-sm ring-1 ring-white/[0.06] overflow-hidden">
      <div className="h-32 bg-nocturn/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
      </div>
      <div className="p-4 space-y-3">
        <div className="h-5 w-3/4 rounded bg-nocturn/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
        </div>
        <div className="flex gap-2">
          <div className="h-3 w-20 rounded bg-nocturn/5" />
          <div className="h-3 w-16 rounded bg-nocturn/5" />
        </div>
        <div className="h-8 w-24 rounded-full bg-nocturn/10" />
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl bg-card/60 backdrop-blur-sm ring-1 ring-white/[0.06] p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-10 rounded-xl bg-nocturn/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
        </div>
        <div className="h-3 w-16 rounded bg-nocturn/5" />
        <div className="h-6 w-10 rounded bg-nocturn/10" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-nocturn/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
        </div>
        <div className="h-4 w-72 rounded bg-nocturn/5" />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 w-32 rounded-full bg-nocturn/10 shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-nocturn/5 to-transparent animate-shimmer-purple" />
          </div>
        ))}
      </div>

      {/* Financial pulse */}
      <div className="rounded-2xl bg-card/60 backdrop-blur-sm ring-1 ring-white/[0.06] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-nocturn/10" />
          <div className="h-4 w-28 rounded bg-nocturn/5" />
        </div>
        <div className="h-6 w-48 rounded bg-nocturn/10" />
        <div className="flex gap-1 h-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-1 rounded-full bg-nocturn/5" />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-3">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
