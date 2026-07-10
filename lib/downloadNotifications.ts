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

// Notifies the store owner when a staff member downloads a CSV export,
// gated behind store.globalSettings.notifications.staff.downloadRequests.
// Only fires for staff actors, not the owner downloading their own data.
export async function notifyStaffDownload(slug: string, actor: string, resourceLabel: string): Promise<void> {
  if (actor.startsWith("owner:")) return; // owner downloading their own data — nothing to notify
  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return;
    const store = storeSnap.data()!;

    const enabled = !!store.globalSettings?.notifications?.staff?.downloadRequests;
    if (!enabled) return;

    const acctEmail = store.globalSettings?.notifications?.account?.notificationEmail || store.contact?.email;
    if (!acctEmail) return;

    const storeName = store.name || slug;
    const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:4px">Staff download activity</h2>
      <p style="color:#555">Your staff member <b>${actor}</b> downloaded a ${resourceLabel} CSV export from ${storeName}.</p>
      <p style="color:#999;font-size:12px;margin-top:20px">Powered by ChatFi Pay</p>
    </div>`;

    await sendEmail(acctEmail, `Staff download - ${storeName}`, html);
  } catch (e) {
    console.error("notifyStaffDownload failed:", e);
  }
}
