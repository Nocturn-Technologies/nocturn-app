// Nocturn branded email templates

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

export function magicLinkEmail(link: string): string {
  return baseTemplate(`
    <h2>Sign in to Nocturn</h2>
    <p>Click the button below to sign in to your account. This link expires in 1 hour.</p>
    <a href="${link}" class="btn">Sign In →</a>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `);
}

export function passwordResetEmail(link: string): string {
  return baseTemplate(`
    <h2>Reset your password</h2>
    <p>Someone requested a password reset for your Nocturn account. Click below to set a new password.</p>
    <a href="${link}" class="btn">Reset Password →</a>
    <p>This link expires in 1 hour. If you didn't request this, no action is needed.</p>
  `);
}

export function welcomeEmail(name: string, collectiveName: string): string {
  return baseTemplate(`
    <h2>Welcome to Nocturn, ${name}! 🎵</h2>
    <p>You've just set up <span class="highlight">${collectiveName}</span> on Nocturn — AI that runs the business while you run the night.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 8px 0; font-weight: 600;">What's next?</p>
      <p style="margin: 0;">→ Create your first event<br>→ Add your team members<br>→ Connect Stripe for payments</p>
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
  return baseTemplate(`
    <h2>You've been invited! 🌙</h2>
    <p><span class="highlight">${inviterName}</span> invited you to join <span class="highlight">${collectiveName}</span> on Nocturn as a <strong>${role}</strong>.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0; font-weight: 600;">${collectiveName}</p>
      <p style="margin: 4px 0 0 0;">Role: ${role}</p>
    </div>
    <a href="${inviteLink}" class="btn">Accept Invitation →</a>
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
  ticketLink: string
): string {
  return baseTemplate(`
    <h2>You're in! 🎉</h2>
    <p>Your tickets for <span class="highlight">${eventTitle}</span> are confirmed.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${eventTitle}</p>
      <p style="margin: 0;">📅 ${eventDate}</p>
      <p style="margin: 4px 0;">📍 ${venueName}</p>
      <p style="margin: 4px 0;">🎫 ${quantity}× ${tierName}</p>
      <p style="margin: 8px 0 0 0; color: #7B2FF7; font-weight: 600; font-size: 18px;">${totalPrice}</p>
    </div>
    <a href="${ticketLink}" class="btn">View Your Ticket & QR Code →</a>
    <p>Tap the button above to see your QR code. Show it at the door for entry. See you there! 🌙</p>
  `);
}

export function settlementReportEmail(
  eventTitle: string,
  eventDate: string,
  grossRevenue: string,
  netProfit: string,
  ticketsSold: number,
  settlementLink: string
): string {
  return baseTemplate(`
    <h2>Settlement Report 💰</h2>
    <p>Here's the financial breakdown for <span class="highlight">${eventTitle}</span>.</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0 0 12px 0; font-weight: 600;">${eventTitle} — ${eventDate}</p>
      <p style="margin: 0;">🎫 Tickets sold: <strong>${ticketsSold}</strong></p>
      <p style="margin: 4px 0;">💵 Gross revenue: <strong>${grossRevenue}</strong></p>
      <p style="margin: 8px 0 0 0; color: #7B2FF7; font-weight: 600; font-size: 20px;">Net profit: ${netProfit}</p>
    </div>
    <a href="${settlementLink}" class="btn">View Full Report →</a>
  `);
}

export function postEventRecapEmail(
  eventTitle: string,
  collectiveName: string,
  attendeeCount: number,
  customBody: string
): string {
  return baseTemplate(`
    <h2>${eventTitle} — What a night! 🌙</h2>
    <p>${customBody}</p>
    <div class="card">
      <p style="color: #FAFAFA; margin: 0;">🎉 ${attendeeCount} people came through</p>
    </div>
    <p>Follow <span class="highlight">${collectiveName}</span> for the next one.</p>
    <a href="https://app.trynocturn.com" class="btn">See What's Next →</a>
  `);
}
