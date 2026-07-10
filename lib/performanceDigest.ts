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

function dateKeyDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function sumStats(slug: string, dateKeys: string[]): Promise<{ revenue: number; orders: number }> {
  let revenue = 0;
  let orders = 0;
  for (const key of dateKeys) {
    const snap = await db.collection("stores").doc(slug).collection("dailyStats").doc(key).get();
    if (snap.exists) {
      const d = snap.data()!;
      revenue += d.revenue || 0;
      orders += d.orders || 0;
    }
  }
  return { revenue, orders };
}

function money(n: number): string {
  return `\u20a6${Number(n || 0).toLocaleString("en-NG")}`;
}

export type DigestPeriod = "daily" | "weekly" | "monthly";

const PERIOD_LABEL: Record<DigestPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const PERIOD_SETTING_KEY: Record<DigestPeriod, string> = {
  daily: "dailyReport",
  weekly: "weeklyReport",
  monthly: "monthlyReport",
};

// Aggregates revenue/orders for the given period from dailyStats and emails
// a digest to the account notification email (if enabled) and any staff
// members with the analytics permission (if enabled). Non-fatal — a failed
// digest for one store should never block the cron run for others.
export async function sendPerformanceDigest(slug: string, period: DigestPeriod): Promise<void> {
  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return;
    const store = storeSnap.data()!;
    const storeName = store.name || slug;
    const settingKey = PERIOD_SETTING_KEY[period];

    const dateKeys =
      period === "daily" ? [dateKeyDaysAgo(1)]
      : period === "weekly" ? Array.from({ length: 7 }, (_, i) => dateKeyDaysAgo(i + 1))
      : Array.from({ length: 30 }, (_, i) => dateKeyDaysAgo(i + 1));

    const { revenue, orders } = await sumStats(slug, dateKeys);

    const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:4px">${PERIOD_LABEL[period]} performance \u2014 ${storeName}</h2>
      <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 6px;color:#555">Revenue: <b>${money(revenue)}</b></p>
        <p style="margin:0;color:#555">Orders: <b>${orders}</b></p>
      </div>
      <p style="color:#999;font-size:12px">Powered by ChatFi Pay</p>
    </div>`;
    const subject = `${PERIOD_LABEL[period]} performance report - ${storeName}`;

    const acctSettings: Record<string, any> = store.globalSettings?.notifications?.account || {};
    const acctEmail = acctSettings.notificationEmail || store.contact?.email;
    if (acctSettings[settingKey] && acctEmail) {
      await sendEmail(acctEmail, subject, html).catch(e => console.error(`Account ${period} digest failed:`, e));
    }

    const staffSettings: Record<string, any> = store.globalSettings?.notifications?.staff || {};
    if (staffSettings[settingKey]) {
      const staffSnap = await db.collection("stores").doc(slug).collection("staff").where("permissions.analytics", "==", true).get();
      for (const doc of staffSnap.docs) {
        const email = doc.id;
        if (email === acctEmail) continue;
        await sendEmail(email, subject, html).catch(e => console.error(`Staff ${period} digest failed for ${email}:`, e));
      }
    }
  } catch (e) {
    console.error(`sendPerformanceDigest(${slug}, ${period}) failed:`, e);
  }
}
