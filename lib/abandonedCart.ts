export async function sendAbandonedCartEmail(
  email: string,
  storeName: string,
  slug: string,
  productName: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const storeUrl = `https://${slug}.chatfi.pro`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `You left something behind at ${storeName}`,
      html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">Still thinking it over?</h2>
        <p style="color:#555">Your order for <b>${productName}</b> at ${storeName} is still waiting for you.</p>
        <a href="${storeUrl}" style="display:inline-block;margin:20px 0;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Complete your order</a>
        <p style="color:#999;font-size:12px">If the button doesn't work, visit: ${storeUrl}</p>
      </div>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed: ${text}`);
  }
}
