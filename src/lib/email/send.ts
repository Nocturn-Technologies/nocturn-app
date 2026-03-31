import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/config";

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
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    console.error("[email] Invalid email format:", to);
    return { error: "Invalid email format", messageId: null };
  }

  const resend = getResend();
  if (!resend) {
    console.info(`[email] Dev mode — skipped sending: ${subject}`);
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

/**
 * Upload a QR code data URI to Supabase Storage and return a public HTTPS URL.
 * Gmail/Outlook block data: URIs and CID attachments are unreliable,
 * so we host QR images and use regular <img src="https://..."> in emails.
 */
async function uploadQRToStorage(
  dataUri: string,
  ticketToken: string,
  index: number = 0
): Promise<string | null> {
  try {
    const base64Match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return null;

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, "base64");

    const admin = createAdminClient();
    const fileName = `${ticketToken}${index > 0 ? `-${index}` : ""}.${mimeType}`;

    const { error } = await admin.storage
      .from("qr-codes")
      .upload(fileName, buffer, {
        contentType: `image/${mimeType}`,
        upsert: true,
      });

    if (error) {
      console.error("[email] QR upload failed:", error);
      return null;
    }

    const { data: publicUrl } = admin.storage
      .from("qr-codes")
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  } catch (err) {
    console.error("[email] QR upload exception:", err);
    return null;
  }
}

/**
 * Convert data:image QR codes to hosted HTTPS URLs via Supabase Storage.
 * Returns the HTML with data: URIs replaced by public URLs, plus the URL list.
 */
export async function prepareQRUrls(
  html: string,
  qrCodes: string[],
  ticketTokens: string[]
): Promise<{ html: string; hostedUrls: string[] }> {
  const hostedUrls: string[] = [];
  let processedHtml = html;

  for (let i = 0; i < qrCodes.length; i++) {
    const dataUri = qrCodes[i];
    if (!dataUri?.startsWith("data:image/")) continue;

    const token = ticketTokens[i] || `ticket-${i}`;
    const publicUrl = await uploadQRToStorage(dataUri, token, 0);

    if (publicUrl) {
      hostedUrls.push(publicUrl);
      processedHtml = processedHtml.replace(dataUri, publicUrl);
    }
  }

  return { html: processedHtml, hostedUrls };
}
