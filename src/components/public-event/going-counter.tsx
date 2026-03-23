"use client";

import { Users } from "lucide-react";

interface GoingCounterProps {
  count: number;
  accentColor: string;
}

export function GoingCounter({ count, accentColor }: GoingCounterProps) {
  if (count === 0) return null;

  const label = count === 1 ? "1 going" : `${count.toLocaleString()} going`;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accentColor}20` }}
      >
        <Users className="h-3.5 w-3.5" style={{ color: accentColor }} />
      </div>
      <span className="text-sm font-medium text-white/60">{label}</span>
    </div>
  );
}
