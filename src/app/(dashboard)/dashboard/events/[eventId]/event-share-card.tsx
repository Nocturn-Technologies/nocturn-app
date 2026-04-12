"use client";

import { ShareCardGenerator } from "@/components/share-card-generator";
import type { ShareCardEvent } from "@/lib/generate-share-card";

export function EventShareCard({
  event,
  variant = "button",
}: {
  event: ShareCardEvent;
  variant?: "button" | "tile";
}) {
  return <ShareCardGenerator event={event} variant={variant} />;
}
