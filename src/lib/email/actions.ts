// Internal email utilities — NOT a server action (not client-callable)
import { sendEmail, prepareQRUrls, type EmailAttachment } from "@/lib/email/send";
import {
  ticketConfirmationEmail,
  welcomeEmail,
  invitationEmail,
} from "@/lib/email/templates";

// Send ticket confirmation email with QR codes hosted on Supabase Storage.
// Gmail/Outlook block data: URIs, so we upload QR PNGs to Supabase Storage and
// use https:// <img src> URLs for inline rendering. We ALSO attach the QR as a
// real file attachment so users always have a way to get the QR (downloadable
// from inside the email) even if inline rendering fails.
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
  ticketTokens?: string[];
}) {
  let html = await ticketConfirmationEmail(
    input.eventTitle,
    input.eventDate,
    input.venueName,
    input.tierName,
    input.quantity,
    input.totalPrice,
    input.ticketLink,
    input.qrCodes
  );

  // Upload QR data URIs to Supabase Storage, replace with https:// URLs in HTML,
  // AND build file attachments as a reliable fallback.
  let attachments: EmailAttachment[] = [];
  if (input.qrCodes && input.qrCodes.length > 0) {
    const tokens = input.ticketTokens || input.qrCodes.map((_, i) => `qr-${Date.now()}-${i}`);
    const prepared = await prepareQRUrls(html, input.qrCodes, tokens);
    html = prepared.html;
    attachments = prepared.attachments;
  }

  return sendEmail({
    to: input.to,
    subject: `🎫 Your tickets for ${input.eventTitle}`,
    html,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
}

// Send welcome email after collective creation
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  collectiveName: string;
}) {
  const html = await welcomeEmail(input.name, input.collectiveName);

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
  const html = await invitationEmail(
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

