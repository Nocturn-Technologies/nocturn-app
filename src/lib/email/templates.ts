// Nocturn branded email templates

import { escapeHtml } from "@/lib/html";

// Sanitize URLs for use in href/src attributes — only allow safe protocols
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return escapeHtml(url);
    }
    return "#";
  } catch {
    // cid: references for inline email attachments (e.g. QR code images)
    if (url.startsWith("cid:")) return url;
    // data: URLs (e.g. for QR codes) — allow only data:image/png and data:image/jpeg
    // Block data:image/svg+xml which can contain JavaScript (case-insensitive check)
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith("data:image/") && !lowerUrl.includes("svg")) return url;
    return "#";
  }
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #09090B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 480px; margin: 0 auto; padding: 40px 24px; }
    .logo { color: #7B2FF7; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; text-decoration: none; }
    .content { margin-top: 32px; color: #FAFAFA; font-size: 15px; line-height: 1.6; }
    .content h2 { color: #FAFAFA; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; }
    .content p { margin: 0 0 16px 0; color: #A1A1AA; }
    .btn { display: inline-block; background: #7B2FF7; color: #FFFFFF !important; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 8px 0 24px 0; }
    .btn:hover { background: #A855F7; }
    .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); color: #52525B; font-size: 12px; }
    .footer a { color: #7B2FF7; text-decoration: none; }
    .highlight { color: #7B2FF7; font-weight: 600; }
    .card { background: #1C1C22; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <a href="https://app.trynocturn.com" class="logo">nocturn.</a>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Powered by <a href="https://app.trynocturn.com">nocturn.</a> — AI for music collectives and promoters</p>
    </div>
  </div>
</body>
</html>`;
}

export function welcomeEmail(name: string, collectiveName: string): string {
  const safeName = escapeHtml(name);
  const safeCollective = escapeHtml(collectiveName);
  return baseTemplate(`
    <h2>Welcome to Nocturn, ${safeName}! 🎵</h2>
    <p>You've just set up <span class="highlight">${safeCollective}</span> on Nocturn — AI that runs the business while you run the night.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 8px 0; font-weight: 600;">What's next?</p>
      <p style="margin: 0;">→ Throw your first night<br>→ Add your crew<br>→ Connect Stripe for payments</p>
    </div>
    <a href="https://app.trynocturn.com/dashboard" class="btn">Open Dashboard →</a>
    <p>Need help? Just reply to this email.</p>
  `);
}

export function invitationEmail(
  inviterName: string,
  collectiveName: string,
  role: string,
  inviteLink: string
): string {
  const safeInviter = escapeHtml(inviterName);
  const safeCollective = escapeHtml(collectiveName);
  const safeRole = escapeHtml(role);
  return baseTemplate(`
    <h2>You've been invited! 🌙</h2>
    <p><span class="highlight">${safeInviter}</span> invited you to join <span class="highlight">${safeCollective}</span> on Nocturn as a <strong>${safeRole}</strong>.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0; font-weight: 600;">${safeCollective}</p>
      <p style="margin: 4px 0 0 0;">Role: ${safeRole}</p>
    </div>
    <a href="${sanitizeUrl(inviteLink)}" class="btn">Accept Invitation →</a>
    <p>This invitation expires in 7 days.</p>
  `);
}

export function ticketConfirmationEmail(
  eventTitle: string,
  eventDate: string,
  venueName: string,
  tierName: string,
  quantity: number,
  totalPrice: string,
  ticketLink: string,
  qrCodes?: string[]
): string {
  // Build QR code section — one per ticket
  const qrSection = qrCodes && qrCodes.length > 0
    ? qrCodes.map((qr, i) => `
      <div style="text-align: center; margin: 16px 0; padding: 20px; background: #FFFFFF; border-radius: 12px;">
        <img src="${sanitizeUrl(qr)}" alt="Ticket ${i + 1} QR Code" width="250" height="250" style="display: block; margin: 0 auto;" />
        <p style="margin: 8px 0 0 0; color: #27272A; font-size: 12px; font-weight: 600;">
          ${quantity > 1 ? `Ticket ${i + 1} of ${quantity}` : "Your Ticket"}
        </p>
        <p style="margin: 2px 0 0 0; color: #71717A; font-size: 11px;">Show this at the door for entry</p>
      </div>
    `).join("")
    : "";

  return baseTemplate(`
    <h2>You're in! 🎉</h2>
    <p>Your tickets for <span class="highlight">${escapeHtml(eventTitle)}</span> are confirmed.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${escapeHtml(eventTitle)}</p>
      <p style="margin: 0;">📅 ${escapeHtml(eventDate)}</p>
      <p style="margin: 4px 0;">📍 ${escapeHtml(venueName)}</p>
      <p style="margin: 4px 0;">🎫 ${quantity}× ${escapeHtml(tierName)}</p>
      <p style="margin: 8px 0 0 0; color: #7B2FF7; font-weight: 600; font-size: 18px;">${escapeHtml(totalPrice)}</p>
    </div>
    ${qrSection || `<p style="color: #A1A1AA; font-size: 13px;">Your QR code is being generated. Tap below to view it.</p>`}
    <a href="${sanitizeUrl(ticketLink)}" class="btn">View Your Ticket →</a>
    <p>Show your QR code at the door for entry. See you there! 🌙</p>
  `);
}

// ── Day-of hype email to attendees ──
export function dayOfHypeEmail(
  eventTitle: string,
  venueName: string,
  doorsTime: string,
  showTime: string,
  dressCode: string | null,
  ticketLink: string
): string {
  return baseTemplate(`
    <h2>Tonight. 🔥</h2>
    <p><span class="highlight">${escapeHtml(eventTitle)}</span> is happening today. Here's everything you need.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${escapeHtml(eventTitle)}</p>
      <p style="margin: 0;">📍 ${escapeHtml(venueName)}</p>
      <p style="margin: 4px 0;">🚪 Doors: ${escapeHtml(doorsTime)}</p>
      <p style="margin: 4px 0;">🎵 Show: ${escapeHtml(showTime)}</p>
      ${dressCode ? `<p style="margin: 4px 0;">👔 Dress code: ${escapeHtml(dressCode)}</p>` : ""}
    </div>
    <a href="${sanitizeUrl(ticketLink)}" class="btn">View Your Ticket →</a>
    <p style="color: #71717A; font-size: 13px;">Have your QR code ready at the door. See you tonight. 🌙</p>
  `);
}

// ── Post-purchase referral nudge ──
export function referralNudgeEmail(
  eventTitle: string,
  buyerName: string,
  referralLink: string,
  collectiveName: string
): string {
  return baseTemplate(`
    <h2>You're in, ${escapeHtml(buyerName)}! One more thing.</h2>
    <p>Know someone who'd be into <span class="highlight">${escapeHtml(eventTitle)}</span>? Share your personal link — every friend who buys through you gets tracked.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 8px 0; font-weight: 600;">Your referral link</p>
      <p style="margin: 0; color: #7B2FF7; word-break: break-all; font-size: 13px;">${escapeHtml(referralLink)}</p>
    </div>
    <p style="color: #A1A1AA;">Bring 5 friends and you earn Ambassador status from <span class="highlight">${escapeHtml(collectiveName)}</span>. Just share the link — we handle the rest.</p>
  `);
}

// ── Organizer: 48hr event countdown ──
export function organizerCountdownEmail(
  eventTitle: string,
  eventDate: string,
  ticketsSold: number,
  totalCapacity: number,
  revenue: string,
  dashboardLink: string
): string {
  const percent = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;
  return baseTemplate(`
    <h2>48 hours out. 📊</h2>
    <p><span class="highlight">${escapeHtml(eventTitle)}</span> is ${escapeHtml(eventDate)}. Here's where you stand.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 4px 0; font-weight: 600;">🎫 ${ticketsSold} / ${totalCapacity} tickets sold (${percent}%)</p>
      <p style="margin: 0; color: #7B2FF7; font-weight: 600; font-size: 18px;">💰 ${revenue} revenue</p>
    </div>
    ${percent < 50 ? `<p style="color: #FB7185;">You're under 50% — consider a last-minute push. Post the lineup on IG tonight, drop a story countdown, or text your top 10 people directly.</p>` : ""}
    ${percent >= 75 ? `<p style="color: #2DD4BF;">You're at ${percent}% — looking strong. Consider holding your price or bumping the final tier up.</p>` : ""}
    <a href="${sanitizeUrl(dashboardLink)}" class="btn">Open Dashboard →</a>
  `);
}

// ── Organizer: Ticket milestone ──
export function ticketMilestoneEmail(
  eventTitle: string,
  milestone: string,
  ticketsSold: number,
  totalCapacity: number,
  dashboardLink: string
): string {
  return baseTemplate(`
    <h2>${milestone} 🎉</h2>
    <p><span class="highlight">${escapeHtml(eventTitle)}</span> just hit <strong>${ticketsSold}</strong> tickets sold out of ${totalCapacity}.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0; font-size: 32px; font-weight: 800; text-align: center;">${Math.round((ticketsSold / totalCapacity) * 100)}%</p>
      <p style="margin: 8px 0 0 0; text-align: center;">capacity sold</p>
    </div>
    <a href="${sanitizeUrl(dashboardLink)}" class="btn">View Event →</a>
  `);
}

// ── Inactive collective nudge ──
export function inactiveNudgeEmail(
  collectiveName: string,
  operatorName: string,
  lastEventDate: string | null
): string {
  return baseTemplate(`
    <h2>Hey ${escapeHtml(operatorName)} — we miss ${escapeHtml(collectiveName)}. 🌙</h2>
    <p>${lastEventDate ? `Your last event was ${lastEventDate}.` : "You haven't created an event yet."} The scene needs you.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 8px 0; font-weight: 600;">Quick ideas to get back in:</p>
      <p style="margin: 0;">→ Throw a low-key midweek set<br>→ Partner with another collective<br>→ Book a venue you've been eyeing</p>
    </div>
    <a href="https://app.trynocturn.com/dashboard/events/new" class="btn">Create Event →</a>
    <p style="color: #71717A; font-size: 12px;">Don't want these reminders? Reply "stop" and we'll pause them.</p>
  `);
}

// ── RSVP confirmation (free events) ──
export function rsvpConfirmationEmail({
  eventTitle,
  collectiveName,
  startsAt,
  venueName,
  venueCity,
  status,
  eventUrl,
  firstName,
}: {
  eventTitle: string;
  collectiveName: string;
  startsAt: string;
  venueName: string | null;
  venueCity: string | null;
  status: "yes" | "maybe" | "no";
  eventUrl: string;
  firstName: string | null;
}): string {
  const dateLabel = (() => {
    try {
      return new Date(startsAt).toLocaleDateString("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  })();
  const timeLabel = (() => {
    try {
      return new Date(startsAt).toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  })();

  const greeting = firstName ? `Hey ${escapeHtml(firstName)} —` : "Hey —";
  const headline =
    status === "yes"
      ? `You're on the list for ${escapeHtml(eventTitle)} 🎉`
      : `We've got you marked as maybe for ${escapeHtml(eventTitle)}`;
  const subhead =
    status === "yes"
      ? `${escapeHtml(collectiveName)} has you confirmed. Here's what you need to know:`
      : `${escapeHtml(collectiveName)} will keep a spot warm — update your RSVP any time.`;

  const venueLine = venueName
    ? `${escapeHtml(venueName)}${venueCity ? `, ${escapeHtml(venueCity)}` : ""}`
    : "Venue details coming soon";

  // The eventUrl already has `?rsvp=TOKEN#rsvp` appended by the server
  // action so tapping the button lands the guest back on the event page
  // with the RSVP widget in "confirmed" view — one tap to change.
  const ctaLabel =
    status === "yes" ? "View event & manage RSVP →" : "Update my RSVP →";

  return baseTemplate(`
    <h2>${headline}</h2>
    <p>${greeting} ${subhead}</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 12px 0; font-size: 18px; font-weight: 700;">${escapeHtml(eventTitle)}</p>
      <p style="color: #A1A1AA; margin: 0 0 4px 0; font-size: 14px;">📅 ${escapeHtml(dateLabel)}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ""}</p>
      <p style="color: #A1A1AA; margin: 0 0 4px 0; font-size: 14px;">📍 ${venueLine}</p>
      <p style="color: #A1A1AA; margin: 0; font-size: 14px;">🎟️ Hosted by ${escapeHtml(collectiveName)}</p>
    </div>
    <a href="${sanitizeUrl(eventUrl)}" class="btn">${ctaLabel}</a>
    <p style="color: #A1A1AA; font-size: 13px;">Plans changed? Tap the button — your existing RSVP will load and you can switch between <strong style="color:#FAFAFA;">Going</strong>, <strong style="color:#FAFAFA;">Maybe</strong>, or <strong style="color:#FAFAFA;">Can&apos;t go</strong> in one tap. No login required.</p>
  `);
}
