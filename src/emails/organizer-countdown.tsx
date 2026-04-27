import * as React from "react";
import Layout, { DetailRow, DynamicBlock, HeroPercent } from "./_layout";

export interface OrganizerCountdownProps {
  eventTitle: string;
  eventDate: string;
  ticketsSold: number;
  totalCapacity: number;
  revenue: string;
  dashboardLink: string;
}

export default function OrganizerCountdown({
  eventTitle,
  eventDate,
  ticketsSold,
  totalCapacity,
  revenue,
  dashboardLink,
}: OrganizerCountdownProps) {
  const percent =
    totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;

  const details: DetailRow[] = [
    { label: "Event date", value: eventDate },
    { label: "Tickets sold", value: `${ticketsSold} / ${totalCapacity}` },
    { label: "Revenue", value: revenue },
  ];

  let pushCopy: React.ReactNode | null = null;
  if (percent < 50) {
    pushCopy = (
      <DynamicBlock title="Push checklist">
        <p style={{ margin: 0 }}>
          → Post the lineup on IG tonight (Promo has captions ready)
        </p>
        <p style={{ margin: "4px 0 0" }}>→ Drop a story countdown</p>
        <p style={{ margin: "4px 0 0" }}>→ DM your top 10 directly</p>
      </DynamicBlock>
    );
  } else if (percent >= 75) {
    pushCopy = (
      <DynamicBlock title="Strong pace">
        <p style={{ margin: 0 }}>
          {percent}% sold — consider holding price or bumping the final tier
          up. Ask Money for a quick pricing test forecast.
        </p>
      </DynamicBlock>
    );
  }

  return (
    <Layout
      preheader={`${ticketsSold} of ${totalCapacity} sold (${percent}%) · ${revenue} revenue. Open dashboard for the last-push checklist.`}
      eyebrow="48 hours out"
      headline={`${ticketsSold} / ${totalCapacity} sold.`}
      intro={
        <>
          <b style={{ color: "#FAFAFA" }}>{eventTitle}</b> is{" "}
          {eventDate.toLowerCase()}. Here's where you stand.
        </>
      }
      hero={<HeroPercent percent={percent} caption={`${revenue} revenue`} />}
      details={details}
      cta={{ label: "Open dashboard  →", href: dashboardLink }}
      dynamic={pushCopy}
    />
  );
}
