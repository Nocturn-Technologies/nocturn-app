import * as React from "react";
import Layout, { DynamicBlock, emailColors } from "./_layout";

export interface ReferralNudgeProps {
  eventTitle: string;
  buyerName: string;
  referralLink: string;
  collectiveName: string;
}

export default function ReferralNudge({
  eventTitle,
  buyerName,
  referralLink,
  collectiveName,
}: ReferralNudgeProps) {
  return (
    <Layout
      preheader={`Send your unique link to friends — every buy through you gets tracked toward Ambassador status.`}
      eyebrow="Going alone is fine. Going with someone is better."
      headline="Who are you bringing?"
      collectiveName={collectiveName}
      intro={
        <>
          {buyerName ? `${buyerName} — ` : ""}
          know someone who'd be into{" "}
          <b style={{ color: "#FAFAFA" }}>{eventTitle}</b>? Share your unique
          link. Every friend who buys through you gets tracked toward
          Ambassador status from {collectiveName}.
        </>
      }
      hero={
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              color: emailColors.muted,
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "1.6px",
              textTransform: "uppercase",
              margin: "0 0 10px",
            }}
          >
            Your referral link
          </p>
          <p
            style={{
              color: emailColors.purple,
              fontSize: "13px",
              wordBreak: "break-all",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {referralLink}
          </p>
        </div>
      }
      cta={{ label: "Copy your link  →", href: referralLink }}
      dynamic={
        <DynamicBlock title="How it works">
          <p style={{ margin: 0 }}>→ Share via iMessage, WhatsApp, or IG DM</p>
          <p style={{ margin: "4px 0 0" }}>
            → Bring 5 buyers, earn Ambassador status from {collectiveName}
          </p>
          <p style={{ margin: "4px 0 0" }}>→ We handle the rest</p>
        </DynamicBlock>
      }
      footerVariant="promotional"
    />
  );
}
