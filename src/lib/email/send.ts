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

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Content-ID for inline embedding — reference in HTML with cid:{contentId} */
  contentId?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    console.error("[email] Invalid email format:", to);
    return { error: "Invalid email format", messageId: null };
  }

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
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        contentId: a.contentId,
      })),
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

/**
 * Convert data:image/png;base64,... QR codes into inline attachments
 * and replace img src with cid: references. Gmail/Outlook block data: URIs
 * but support cid: inline attachments.
 */
export function prepareQRAttachments(
  html: string,
  qrCodes: string[]
): { html: string; attachments: EmailAttachment[] } {
  const attachments: EmailAttachment[] = [];
  let processedHtml = html;

  for (let i = 0; i < qrCodes.length; i++) {
    const dataUri = qrCodes[i];
    if (!dataUri?.startsWith("data:image/")) continue;

    const cid = `qr-ticket-${i + 1}`;

    // Extract base64 content from data URI
    const base64Match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) continue;

    const mimeType = base64Match[1]; // png, jpeg, etc.
    const base64Data = base64Match[2];

    attachments.push({
      filename: `ticket-qr-${i + 1}.${mimeType}`,
      content: Buffer.from(base64Data, "base64"),
      contentType: `image/${mimeType}`,
      contentId: cid,
    });

    // Replace the data: URI in HTML with cid: reference
    // The sanitizeUrl function may have passed through the data URI as-is
    processedHtml = processedHtml.replace(dataUri, `cid:${cid}`);
  }

  return { html: processedHtml, attachments };
}
