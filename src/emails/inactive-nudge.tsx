import * as React from "react";
import Layout, { DynamicBlock } from "./_layout";

export interface InactiveNudgeProps {
  collectiveName: string;
  operatorName: string;
  lastEventDate: string | null;
  newEventUrl: string;
}

export default function InactiveNudge({
  collectiveName,
  operatorName,
  lastEventDate,
  newEventUrl,
}: InactiveNudgeProps) {
  return (
    <Layout
      preheader={
        lastEventDate
          ? `Your last event was ${lastEventDate}. Whenever you book the next, Promo has your tone dialed in.`
          : `You haven't dropped an event yet. Whenever you're ready, Promo has your tone dialed in.`
      }
      eyebrow="Quiet stretch"
      headline={`What's next for ${collectiveName}?`}
      collectiveName={collectiveName}
      intro={
        <>
          {operatorName ? `Hey ${operatorName} — ` : "Hey — "}
          {lastEventDate
            ? `your last event was ${lastEventDate}. `
            : "you haven't dropped an event yet. "}
          Whenever you book the next one, Promo already has your tone dialed
          in from your last sessions.
        </>
      }
      cta={{ label: "Create event  →", href: newEventUrl }}
      dynamic={
        <DynamicBlock title="Quick ideas">
          <p style={{ margin: 0 }}>→ Throw a low-key midweek set</p>
          <p style={{ margin: "4px 0 0" }}>→ Partner with another collective</p>
          <p style={{ margin: "4px 0 0" }}>→ Book a venue you've been eyeing</p>
        </DynamicBlock>
      }
      footerVariant="promotional"
    >
      <p
        style={{
          color: "#71717A",
          fontSize: "12px",
          margin: "20px 0 0",
        }}
      >
        Don't want these reminders? Reply &quot;stop&quot; and we'll pause them.
      </p>
    </Layout>
  );
}
