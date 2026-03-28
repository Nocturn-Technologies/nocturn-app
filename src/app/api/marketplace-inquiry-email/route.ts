import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Use dedicated internal secret — never fall back to service role key
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip control characters (newlines, tabs, etc.) to prevent email header injection */
function sanitizeHeaderValue(str: string): string {
  return str.replace(/[\r\n\t\x00-\x1f]/g, "").slice(0, 200);
}

export async function POST(req: NextRequest) {
  // Auth check: Only allow calls from our own server actions (via shared secret)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${INTERNAL_SECRET}`;
  if (!INTERNAL_SECRET || authHeader !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (
    !RESEND_API_KEY ||
    RESEND_API_KEY === "re_placeholder" ||
    RESEND_API_KEY === "re_YOUR_KEY_HERE"
  ) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }

  let body: {
    to?: string;
    toEmail?: string;
    profileName?: string;
    toName?: string;
    senderName?: string;
    fromUserId?: string;
    message?: string;
    inquiryType?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to = body.to || body.toEmail;
  const profileName = body.profileName || body.toName || "there";
  const senderName = body.senderName || "Someone";
  const message = body.message || "";

  if (!to) {
    return NextResponse.json(
      { error: "Missing recipient email" },
      { status: 400 }
    );
  }

  const escapedSender = escapeHtml(senderName);
  const escapedMessage = escapeHtml(message);
  const escapedProfileName = escapeHtml(profileName);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090B;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#12111a;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 16px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                Nocturn
              </div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:16px 32px 32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;">
                New inquiry for ${escapedProfileName}
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;">
                <strong style="color:#ffffff;">${escapedSender}</strong> wants to connect with you on Nocturn.
              </p>
              <!-- Message box -->
              <div style="background-color:rgba(123,47,247,0.08);border:1px solid rgba(123,47,247,0.2);border-radius:12px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:14px;color:#e4e4e7;line-height:1.6;white-space:pre-wrap;">${escapedMessage}</p>
              </div>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/dashboard/chat" style="display:inline-block;background-color:#7B2FF7;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:10px;">
                      View on Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                Sent by Nocturn &mdash; You run the night. Nocturn runs the business.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Nocturn <noreply@trynocturn.com>",
        to: [to],
        subject: `${sanitizeHeaderValue(senderName)} wants to connect on Nocturn`,
        html,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Resend API error:", res.status, errData);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
