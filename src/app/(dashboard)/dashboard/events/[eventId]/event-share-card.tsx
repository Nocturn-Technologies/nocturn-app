"use client";

import { ShareCardGenerator } from "@/components/share-card-generator";
import type { ShareCardEvent } from "@/lib/generate-share-card";

export function EventShareCard({ event }: { event: ShareCardEvent }) {
  return <ShareCardGenerator event={event} variant="button" />;
}
