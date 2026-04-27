import * as React from "react";
import Layout, { HeroPercent } from "./_layout";

export interface TicketMilestoneProps {
  eventTitle: string;
  milestone: string;
  ticketsSold: number;
  totalCapacity: number;
  dashboardLink: string;
}

export default function TicketMilestone({
  eventTitle,
  milestone,
  ticketsSold,
  totalCapacity,
  dashboardLink,
}: TicketMilestoneProps) {
  const percent =
    totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;

  return (
    <Layout
      preheader={`${eventTitle} hit ${milestone} — ${ticketsSold} of ${totalCapacity} sold.`}
      eyebrow="Milestone"
      headline={`${milestone}.`}
      intro={
        <>
          <b style={{ color: "#FAFAFA" }}>{eventTitle}</b> just crossed{" "}
          <b style={{ color: "#FAFAFA" }}>{ticketsSold}</b> tickets sold of{" "}
          {totalCapacity}.
        </>
      }
      hero={<HeroPercent percent={percent} caption={`${ticketsSold} of ${totalCapacity} sold`} />}
      cta={{ label: "View event  →", href: dashboardLink }}
    />
  );
}
