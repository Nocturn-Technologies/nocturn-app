interface HostMessageProps {
  message: string;
  hostName: string;
  hostAvatarUrl: string | null;
  accentColor: string;
}

export function HostMessage({ message, hostName, hostAvatarUrl, accentColor }: HostMessageProps) {
  return (
    <div className="space-y-3">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white/40">
        From the host
      </h2>
      <div
        className="rounded-2xl border p-5 space-y-4"
        style={{
          borderColor: `${accentColor}20`,
          backgroundColor: `${accentColor}08`,
        }}
      >
        <p className="text-[15px] leading-relaxed text-white/80 italic">
          &ldquo;{message}&rdquo;
        </p>
        <div className="flex items-center gap-2.5">
          {hostAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hostAvatarUrl}
              alt={hostName}
              className="h-6 w-6 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/10"
              style={{ backgroundColor: accentColor }}
            >
              {hostName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs font-medium text-white/40">— {hostName}</span>
        </div>
      </div>
    </div>
  );
}
