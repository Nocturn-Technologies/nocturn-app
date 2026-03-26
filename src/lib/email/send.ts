import { Resend } from "resend";

// Lazy-initialize Resend client to avoid crash when API key is missing at build time
let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nocturn <noreply@trynocturn.com>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] Dev mode — skipped sending: ${subject}`);
    return { error: null, messageId: "dev-mode" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email] Send failed:", error);
      return { error: error.message, messageId: null };
    }

    return { error: null, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[email] Exception:", message);
    return { error: message, messageId: null };
  }
}
