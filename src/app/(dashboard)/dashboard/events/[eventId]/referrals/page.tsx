import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Share2 } from "lucide-react";

export default function ReferralsPage() {
  return (
    <ComingSoonGate
      title="Ambassador Program"
      description="Referral links, ambassador rewards, and fan-driven growth. Coming soon."
      icon={<Share2 className="w-8 h-8 text-nocturn" />}
    />
  );
}
