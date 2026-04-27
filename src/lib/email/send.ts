import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/config";

// Lazy-initialize Resend client to avoid crash when API key is missing at build time
let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  // Treat missing OR the literal ".env.example" placeholder as "not configured".
  // Without this guard, local dev silently hits Resend with a bogus key and
  // every 4xx response gets dropped without retry — no logs, no emails.
  if (!key || key === "your_resend_api_key" || !key.startsWith("re_")) {
    return null;
  }
  if (!_resend) {
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Nocturn <noreply@trynocturn.com>";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || "hi@trynocturn.com";

export interface EmailAttachment {
  /** Filename the recipient sees */
  filename: string;
  /** Base64-encoded content (without the data: prefix) OR a Buffer */
  content: string | Buffer;
}

/**
 * Convert HTML to plain text for the multipart text/plain alternative.
 * Resend will use this automatically when both `html` and `text` are passed.
 *
 * Mail clients with HTML disabled, screen readers, and text-ratio spam
 * filters all benefit. Postmaster Tools previously flagged the system
 * for a 6% text ratio — providing a real text alternative fixes this.
 */
export function htmlToPlainText(html: string): string {
  return (
    html
      // Drop entire <head>, <style>, <script> blocks
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      // Convert common block elements to newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|footer|header)>/gi, "\n")
      .replace(/<br\s*\/?>(?!\n)/gi, "\n")
      .replace(/<\/td>/gi, "\t")
      // Strip remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode common entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&[a-z0-9]+;/gi, "")
      // Collapse 3+ newlines to 2, trim trailing spaces per line
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Auto-generated from html if omitted. Pass to override. */
  text?: string;
  /** Override the reply-to address (default: hi@trynocturn.com) */
  replyTo?: string;
  /** Custom headers — e.g. List-Unsubscribe for promotional sends */
  headers?: Record<string, string>;
  /**
   * Promotional emails get a `List-Unsubscribe` header with the given URL.
   * Pass null to opt out (transactional emails skip this).
   */
  unsubscribeUrl?: string | null;
  attachments?: EmailAttachment[];
}

export async function sendEmail(options: SendEmailOptions) {
  const {
    to,
    subject,
    html,
    text,
    replyTo,
    headers: extraHeaders,
    unsubscribeUrl,
    attachments,
  } = options;
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    console.error("[email] Invalid email format:", to);
    return { error: "Invalid email format", messageId: null };
  }

  const resend = getResend();
  if (!resend) {
    // Gap 26: In production, missing RESEND_API_KEY should be a hard error
    if (process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY is missing in production!");
      throw new Error("RESEND_API_KEY is not configured. Emails cannot be sent in production.");
    }
    console.info(`[email] Dev mode — skipped sending: ${subject}`);
    return { error: null, messageId: "dev-mode" };
  }

  // Build text alternative + headers
  const textAlt = text ?? htmlToPlainText(html);
  const headers: Record<string, string> = { ...extraHeaders };
  if (unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // Retry wrapper: up to 3 attempts with 1s delay, only retry on network/5xx errors
  const MAX_RETRIES = 3;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject,
        html,
        text: textAlt,
        replyTo: replyTo ?? REPLY_TO_EMAIL,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });

      if (error) {
        // Resend API errors: check if retryable (5xx) or not (4xx)
        const statusCode = (error as unknown as { statusCode?: number }).statusCode;
        const is4xx = statusCode && statusCode >= 400 && statusCode < 500;

        if (is4xx) {
          // 4xx errors are client errors (bad request) — don't retry
          console.error(`[email] Send failed (4xx, not retrying):`, error);
          return { error: error.message, messageId: null };
        }

        lastError = error.message;
        console.warn(`[email] Send failed (attempt ${attempt}/${MAX_RETRIES}):`, error);

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        return { error: lastError, messageId: null };
      }

      console.info(`[email] sent successfully`, {
        messageId: data?.id,
        to,
        subject,
        from: FROM_EMAIL,
      });
      return { error: null, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      lastError = message;
      console.warn(`[email] Exception (attempt ${attempt}/${MAX_RETRIES}):`, message);

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
    }
  }

  // TODO: If all retries fail, enqueue for background retry (e.g., via Vercel Cron)
  // so buyers always receive their confirmation email.
  console.error("[email] All retry attempts exhausted");
  return { error: lastError ?? "Email send failed after retries", messageId: null };
}

/**
 * Upload a QR code data URI to Supabase Storage and return a public HTTPS URL.
 * Gmail/Outlook block data: URIs and CID attachments are unreliable,
 * so we host QR images and use regular <img src="https://..."> in emails.
 *
 * Defensive: lazily creates the `qr-codes` bucket if it doesn't exist.
 */
async function uploadQRToStorage(
  dataUri: string,
  ticketToken: string,
  index: number = 0
): Promise<string | null> {
  try {
    const base64Match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      console.warn("[email] QR upload skipped — not a data URI");
      return null;
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, "base64");

    const admin = createAdminClient();
    const fileName = `${ticketToken}${index > 0 ? `-${index}` : ""}.${mimeType}`;

    let uploadError: { message: string } | null = null;
    {
      const { error } = await admin.storage
        .from("qr-codes")
        .upload(fileName, buffer, {
          contentType: `image/${mimeType}`,
          upsert: true,
        });
      uploadError = error ? { message: error.message } : null;
    }

    // Bucket missing — create it and retry once
    if (uploadError && /bucket.*not.*found|not.*found.*bucket/i.test(uploadError.message)) {
      console.warn("[email] qr-codes bucket missing, creating it and retrying");
      await admin.storage.createBucket("qr-codes", {
        public: true,
        allowedMimeTypes: ["image/png", "image/jpeg"],
        fileSizeLimit: 256 * 1024,
      });
      const { error: retryError } = await admin.storage
        .from("qr-codes")
        .upload(fileName, buffer, {
          contentType: `image/${mimeType}`,
          upsert: true,
        });
      uploadError = retryError ? { message: retryError.message } : null;
    }

    if (uploadError) {
      console.error("[email] QR upload failed:", uploadError.message, "fileName:", fileName);
      return null;
    }

    const { data: publicUrl } = admin.storage
      .from("qr-codes")
      .getPublicUrl(fileName);

    if (!publicUrl?.publicUrl) {
      console.error("[email] QR upload returned no public URL for", fileName);
      return null;
    }

    return publicUrl.publicUrl;
  } catch (err) {
    console.error("[email] QR upload exception:", err);
    return null;
  }
}

/**
 * Convert data:image QR codes to hosted HTTPS URLs via Supabase Storage.
 * Returns the HTML with data: URIs replaced by public URLs, plus the URL list
 * AND a list of Resend-ready attachments as a fallback for clients that strip
 * external images (Outlook protected view, corporate spam filters, etc.).
 *
 * The attachments arrive as real downloadable files named `ticket-1.png`, etc.,
 * so the user always has a way to get the QR even if the inline image fails.
 */
export async function prepareQRUrls(
  html: string,
  qrCodes: string[],
  ticketTokens: string[]
): Promise<{
  html: string;
  hostedUrls: string[];
  attachments: EmailAttachment[];
}> {
  const hostedUrls: string[] = [];
  const attachments: EmailAttachment[] = [];
  let processedHtml = html;

  for (let i = 0; i < qrCodes.length; i++) {
    const dataUri = qrCodes[i];
    if (!dataUri?.startsWith("data:image/")) continue;

    // 1. Always attach as a real file — guarantees delivery of the QR
    const base64Match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (base64Match) {
      const ext = base64Match[1];
      const base64 = base64Match[2];
      attachments.push({
        filename: `ticket-${i + 1}.${ext}`,
        content: base64,
      });
    }

    // 2. Also try to host for inline rendering (much nicer UX when it works)
    const token = ticketTokens[i] || `ticket-${i}`;
    const publicUrl = await uploadQRToStorage(dataUri, token, 0);

    if (publicUrl) {
      hostedUrls.push(publicUrl);
      // Use a global-equivalent replace so every occurrence of this data URI
      // is swapped — split/join is safer than `replace(str, str)` which only
      // replaces the first match.
      processedHtml = processedHtml.split(dataUri).join(publicUrl);
    } else {
      // Upload failed — remove the entire wrapping <div>...<img src="dataUri"...>
      // block so we don't ship a broken image icon. The attachment fallback
      // still delivers the QR as a downloadable file, and the "View Your Ticket"
      // button still leads to the working QR on the ticket page.
      const imgRegex = new RegExp(
        `<div[^>]*>\\s*<img[^>]*src=["']${escapeRegExp(dataUri)}["'][^>]*\\/?>[\\s\\S]*?<\\/div>`,
        "i"
      );
      if (imgRegex.test(processedHtml)) {
        processedHtml = processedHtml.replace(
          imgRegex,
          `<p style="color: #A1A1AA; font-size: 13px; text-align: center; padding: 12px;">Your QR code is attached to this email — tap the attachment or the button below to view it.</p>`
        );
      } else {
        // Defensive: if the wrapping div can't be matched, just strip the data URI
        processedHtml = processedHtml.split(dataUri).join("#");
      }
    }
  }

  return { html: processedHtml, hostedUrls, attachments };
}

// Escape a string for literal use inside a RegExp
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
