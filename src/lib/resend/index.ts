import { Resend } from "resend";

let _client: Resend | null = null;

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[resend] RESEND_API_KEY not set");
    return null;
  }
  if (!_client) {
    _client = new Resend(key);
  }
  return _client;
}

/** @deprecated Use getResendClient() instead */
export const resend = null as unknown as Resend;
