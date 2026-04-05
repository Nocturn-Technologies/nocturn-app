import { ComingSoonGate } from "@/components/coming-soon-gate";
import { Mail } from "lucide-react";

export default function EmailComposerPage() {
  return (
    <ComingSoonGate
      title="Email Campaigns"
      description="AI-powered email campaigns for your events. Coming after launch."
      icon={<Mail className="w-8 h-8 text-nocturn" />}
    />
  );
}
