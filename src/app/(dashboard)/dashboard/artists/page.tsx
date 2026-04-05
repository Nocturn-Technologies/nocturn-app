import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Music } from "lucide-react";

export default function ArtistsPage() {
  return (
    <ComingSoonGate
      title="Artist Directory"
      description="Browse, discover, and book artists from the platform. Coming soon."
      icon={<Music className="w-8 h-8 text-nocturn" />}
    />
  );
}
