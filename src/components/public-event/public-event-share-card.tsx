"use client";

import { ShareCardGenerator } from "@/components/share-card-generator";
import type { ShareCardEvent } from "@/lib/generate-share-card";

interface Props {
  event: ShareCardEvent;
  accentColor?: string;
}

export function PublicEventShareCard({ event, accentColor }: Props) {
  return (
    <ShareCardGenerator event={event} variant="full" accentColor={accentColor} />
  );
}
