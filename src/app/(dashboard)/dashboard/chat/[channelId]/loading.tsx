export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-1.5rem)] -m-4 md:-m-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-4 h-14 bg-card/95 border-b border-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-muted-foreground/10 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-32 rounded bg-muted-foreground/10 animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-muted-foreground/5 animate-pulse" />
        </div>
        <div className="w-9 h-9 rounded-xl bg-muted-foreground/10 animate-pulse" />
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 px-3 py-4 space-y-4">
        <div className="flex justify-start">
          <div className="max-w-[70%] space-y-1.5">
            <div className="h-3 w-16 rounded bg-muted-foreground/10 animate-pulse" />
            <div className="rounded-2xl rounded-tl-md bg-card/60 px-4 py-3 space-y-2">
              <div className="h-3 w-44 rounded bg-muted-foreground/10 animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted-foreground/10 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[60%]">
            <div className="rounded-2xl rounded-tr-md bg-nocturn/10 px-4 py-3 space-y-2">
              <div className="h-3 w-36 rounded bg-nocturn/10 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[80%] space-y-1.5">
            <div className="h-3 w-20 rounded bg-nocturn/10 animate-pulse" />
            <div className="rounded-2xl rounded-tl-md bg-nocturn/5 px-4 py-3 space-y-2">
              <div className="h-3 w-52 rounded bg-nocturn/10 animate-pulse" />
              <div className="h-3 w-40 rounded bg-nocturn/10 animate-pulse" />
              <div className="h-3 w-28 rounded bg-nocturn/10 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Input bar skeleton */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-11 h-11 rounded-xl bg-muted-foreground/10 animate-pulse" />
          <div className="flex-1 h-11 rounded-xl bg-accent/50 animate-pulse" />
          <div className="w-11 h-11 rounded-xl bg-muted-foreground/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
