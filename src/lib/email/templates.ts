// Nocturn branded email templates
//
// Each export here renders a React Email component to an HTML string.
// Function signatures are preserved from the previous string-based
// implementation, but they now return Promise<string> because
// @react-email/components 1.0.x ships an async render(). Callers must `await`.
// The actual layout, typography, and styling now live in
// src/emails/_layout.tsx + src/emails/*.tsx.

import { render } from "@react-email/components";
import * as React from "react";

import Welcome from "@/emails/welcome";
import LineupInvite from "@/emails/lineup-invite";
import Invitation from "@/emails/invitation";
import TicketConfirmation from "@/emails/ticket-confirmation";
import DayOfHype from "@/emails/day-of-hype";
import ReferralNudge from "@/emails/referral-nudge";
import OrganizerCountdown from "@/emails/organizer-countdown";
import TicketMilestone from "@/emails/ticket-milestone";
import InactiveNudge from "@/emails/inactive-nudge";
import RsvpConfirmation from "@/emails/rsvp-confirmation";

const APP_URL = "https://app.trynocturn.com";

async function renderHtml(node: React.ReactElement): Promise<string> {
  return await render(node, { pretty: false });
}

export async function welcomeEmail(
  name: string,
  collectiveName: string,
): Promise<string> {
  return renderHtml(
    React.createElement(Welcome, {
      firstName: name || "there",
      collectiveName,
      dashboardUrl: `${APP_URL}/dashboard`,
    }),
  );
}

export async function lineupInviteEmail(params: {
  artistFirstName: string;
  collectiveName: string;
  eventTitle: string;
  eventDate: string;
  venueName: string | null;
  setTime: string | null;
  feeDisplay: string | null;
  acceptLink: string;
}): Promise<string> {
  return renderHtml(React.createElement(LineupInvite, params));
}

export async function invitationEmail(
  inviterName: string,
  collectiveName: string,
  role: string,
  inviteLink: string,
): Promise<string> {
  return renderHtml(
    React.createElement(Invitation, {
      inviterName,
      collectiveName,
      role,
      inviteLink,
    }),
  );
}

export async function ticketConfirmationEmail(
  eventTitle: string,
  eventDate: string,
  venueName: string,
  tierName: string,
  quantity: number,
  totalPrice: string,
  ticketLink: string,
  qrCodes?: string[],
): Promise<string> {
  return renderHtml(
    React.createElement(TicketConfirmation, {
      eventTitle,
      eventDate,
      venueName,
      tierName,
      quantity,
      totalPrice,
      ticketLink,
      qrCodes,
    }),
  );
}

export async function dayOfHypeEmail(
  eventTitle: string,
  venueName: string,
  doorsTime: string,
  showTime: string,
  dressCode: string | null,
  ticketLink: string,
): Promise<string> {
  return renderHtml(
    React.createElement(DayOfHype, {
      eventTitle,
      venueName,
      doorsTime,
      showTime,
      dressCode,
      ticketLink,
    }),
  );
}

export async function referralNudgeEmail(
  eventTitle: string,
  buyerName: string,
  referralLink: string,
  collectiveName: string,
): Promise<string> {
  return renderHtml(
    React.createElement(ReferralNudge, {
      eventTitle,
      buyerName,
      referralLink,
      collectiveName,
    }),
  );
}

export async function organizerCountdownEmail(
  eventTitle: string,
  eventDate: string,
  ticketsSold: number,
  totalCapacity: number,
  revenue: string,
  dashboardLink: string,
): Promise<string> {
  return renderHtml(
    React.createElement(OrganizerCountdown, {
      eventTitle,
      eventDate,
      ticketsSold,
      totalCapacity,
      revenue,
      dashboardLink,
    }),
  );
}

export async function ticketMilestoneEmail(
  eventTitle: string,
  milestone: string,
  ticketsSold: number,
  totalCapacity: number,
  dashboardLink: string,
): Promise<string> {
  return renderHtml(
    React.createElement(TicketMilestone, {
      eventTitle,
      milestone,
      ticketsSold,
      totalCapacity,
      dashboardLink,
    }),
  );
}

export async function inactiveNudgeEmail(
  collectiveName: string,
  operatorName: string,
  lastEventDate: string | null,
): Promise<string> {
  return renderHtml(
    React.createElement(InactiveNudge, {
      collectiveName,
      operatorName,
      lastEventDate,
      newEventUrl: `${APP_URL}/dashboard/events/new`,
    }),
  );
}

export async function rsvpConfirmationEmail(params: {
  eventTitle: string;
  collectiveName: string;
  startsAt: string;
  venueName: string | null;
  venueCity: string | null;
  status: "yes" | "maybe" | "no";
  eventUrl: string;
  firstName: string | null;
}): Promise<string> {
  return renderHtml(React.createElement(RsvpConfirmation, params));
}
