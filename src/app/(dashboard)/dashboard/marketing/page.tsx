import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Sparkles } from "lucide-react";

export default function MarketingPage() {
  return (
    <ComingSoonGate
      title="Promo Agent"
      description="AI-powered flyers, email campaigns, and social content. Coming after launch."
      icon={<Sparkles className="w-8 h-8 text-nocturn" />}
    />
  );
}
