import * as React from "react";
import Layout, { DynamicBlock } from "./_layout";

export interface WelcomeProps {
  firstName: string;
  collectiveName: string;
  dashboardUrl: string;
}

export default function Welcome({
  firstName,
  collectiveName,
  dashboardUrl,
}: WelcomeProps) {
  return (
    <Layout
      preheader={`Your account for ${collectiveName} is live. Three things to do first.`}
      eyebrow="Welcome"
      eyebrowVariant="green"
      headline={`Welcome, ${firstName}.`}
      collectiveName={collectiveName}
      intro={
        <>
          Your account for <b style={{ color: "#FAFAFA" }}>{collectiveName}</b> is
          live. The fastest path to value is creating your first event — Promo
          will have content ready before you finish.
        </>
      }
      cta={{ label: "Open dashboard  →", href: dashboardUrl }}
      dynamic={
        <DynamicBlock title="Three things to do first">
          <p style={{ margin: 0 }}>→ Throw your first night</p>
          <p style={{ margin: "4px 0 0" }}>→ Add your crew</p>
          <p style={{ margin: "4px 0 0" }}>→ Connect Stripe for payouts</p>
        </DynamicBlock>
      }
    />
  );
}
