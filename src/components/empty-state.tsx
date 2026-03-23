import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  accentColor?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  accentColor = "#7B2FF7",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in-up">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5"
        style={{ backgroundColor: `${accentColor}15` }}
      >
        <Icon className="h-7 w-7" style={{ color: accentColor }} />
      </div>
      <h3 className="text-lg font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] mb-6">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button
            className="rounded-xl px-6 text-white"
            style={{ backgroundColor: accentColor }}
          >
            {actionLabel}
          </Button>
        </Link>
      )}
    </div>
  );
}
