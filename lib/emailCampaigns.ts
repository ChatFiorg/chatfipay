import crypto from "crypto";

function getSecret(): string {
  const secret = process.env.BUYER_AUTH_SECRET;
  if (!secret) throw new Error("BUYER_AUTH_SECRET not configured");
  return secret;
}

// Signed so a customer can only unsubscribe their own email from a given
// store's campaigns — the link can't be reused to unsubscribe someone else.
export function generateUnsubscribeToken(slug: string, email: string): string {
  return crypto.createHmac("sha256", getSecret()).update(`${slug}:${email.toLowerCase()}`).digest("hex");
}

export function verifyUnsubscribeToken(slug: string, email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(slug, email);
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, tokenBuf);
}

type BatchEmailItem = { to: string; subject: string; html: string; replyTo?: string };

// Resend's batch endpoint accepts up to 100 emails per call, each with its
// own recipient/content — used here so every recipient gets a personalized
// unsubscribe link embedded in their copy without one request per email.
export async function sendBatchEmails(items: BatchEmailItem[], fromAddress: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const BATCH_SIZE = 100;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        chunk.map((item) => ({
          from: fromAddress,
          to: item.to,
          subject: item.subject,
          html: item.html,
          reply_to: item.replyTo || undefined,
        }))
      ),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend batch send failed: ${text}`);
    }
  }
}
