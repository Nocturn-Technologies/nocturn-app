// Internal email utilities — NOT a server action (not client-callable)
import { sendEmail, prepareQRAttachments } from "@/lib/email/send";
import {
  ticketConfirmationEmail,
  settlementReportEmail,
  postEventRecapEmail,
  welcomeEmail,
  invitationEmail,
} from "@/lib/email/templates";

// Send ticket confirmation email with QR codes as inline CID attachments
// (Gmail/Outlook block data: URIs, but support cid: inline attachments)
export async function sendTicketConfirmation(input: {
  to: string;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  tierName: string;
  quantity: number;
  totalPrice: string;
  ticketLink: string;
  qrCodes?: string[];
}) {
  let html = ticketConfirmationEmail(
    input.eventTitle,
    input.eventDate,
    input.venueName,
    input.tierName,
    input.quantity,
    input.totalPrice,
    input.ticketLink,
    input.qrCodes
  );

  // Convert data: URI QR codes to CID inline attachments
  let attachments;
  if (input.qrCodes && input.qrCodes.length > 0) {
    const prepared = prepareQRAttachments(html, input.qrCodes);
    html = prepared.html;
    attachments = prepared.attachments;
  }

  return sendEmail({
    to: input.to,
    subject: `🎫 Your tickets for ${input.eventTitle}`,
    html,
    attachments,
  });
}

// Send welcome email after collective creation
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  collectiveName: string;
}) {
  const html = welcomeEmail(input.name, input.collectiveName);

  return sendEmail({
    to: input.to,
    subject: `Welcome to Nocturn, ${input.name}! 🎵`,
    html,
  });
}

// Send invitation email
export async function sendInvitationEmail(input: {
  to: string;
  inviterName: string;
  collectiveName: string;
  role: string;
  inviteLink: string;
}) {
  const html = invitationEmail(
    input.inviterName,
    input.collectiveName,
    input.role,
    input.inviteLink
  );

  return sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.collectiveName} on Nocturn`,
    html,
  });
}

// Send settlement report
export async function sendSettlementReportEmail(input: {
  to: string;
  eventTitle: string;
  eventDate: string;
  grossRevenue: string;
  netProfit: string;
  ticketsSold: number;
  settlementLink: string;
}) {
  const html = settlementReportEmail(
    input.eventTitle,
    input.eventDate,
    input.grossRevenue,
    input.netProfit,
    input.ticketsSold,
    input.settlementLink
  );

  return sendEmail({
    to: input.to,
    subject: `Settlement Report: ${input.eventTitle}`,
    html,
  });
}

// Send post-event recap to attendees
export async function sendRecapEmail(input: {
  to: string;
  eventTitle: string;
  collectiveName: string;
  attendeeCount: number;
  body: string;
}) {
  const html = postEventRecapEmail(
    input.eventTitle,
    input.collectiveName,
    input.attendeeCount,
    input.body
  );

  return sendEmail({
    to: input.to,
    subject: `${input.eventTitle} — Thanks for coming! 🌙`,
    html,
  });
}
