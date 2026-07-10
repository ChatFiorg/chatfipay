import { db } from "@/lib/firebaseAdmin";

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed: ${text}`);
  }
}

// Sends a welcome email to a brand-new customer, gated behind
// store.globalSettings.campaigns.welcomeEmails (off by default, matching
// Bumpa). Never throws — a failure here should never break the payment
// webhook that triggers it.
export async function notifyNewCustomer(slug: string, email: string | null | undefined, name: string | null | undefined): Promise<void> {
  if (!email) return;
  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return;
    const store = storeSnap.data()!;

    const enabled = !!store.globalSettings?.campaigns?.welcomeEmails;
    if (!enabled) return;

    const storeName = store.name || slug;
    const storeUrl = `https://${slug}.chatfi.pro`;
    const greetingName = name ? name.split(" ")[0] : "there";

    const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:4px">Welcome to ${storeName}!</h2>
      <p style="color:#555">Hi ${greetingName}, thanks for shopping with us. We're glad to have you as a customer.</p>
      <a href="${storeUrl}" style="display:inline-block;margin:20px 0;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Keep browsing</a>
      <p style="color:#999;font-size:12px">Powered by ChatFi Pay</p>
    </div>`;

    await sendEmail(email, `Welcome to ${storeName}!`, html);
  } catch (e) {
    console.error("notifyNewCustomer failed:", e);
  }
}
