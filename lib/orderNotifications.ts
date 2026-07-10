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

function money(n: number): string {
  return `\u20a6${Number(n || 0).toLocaleString("en-NG")}`;
}

// Fires customer + account notification emails for an order lifecycle event.
// Reads store.globalSettings.notifications to decide who should receive what.
// Never throws — a notification failure should never break checkout or the
// payment webhook, so every failure path is caught and logged instead.
export async function notifyOrderEvent(slug: string, orderId: string, event: "created" | "confirmed"): Promise<void> {
  try {
    const [storeSnap, orderSnap] = await Promise.all([
      db.collection("stores").doc(slug).get(),
      db.collection("stores").doc(slug).collection("orders").doc(orderId).get(),
    ]);
    if (!storeSnap.exists || !orderSnap.exists) return;

    const store = storeSnap.data()!;
    const order = orderSnap.data()!;
    const notif = store.globalSettings?.notifications || {};
    const storeName = store.name || slug;
    const storeUrl = `https://${slug}.chatfi.pro`;

    // Customer email
    const custSettings = notif.customer || {};
    const custEnabled = event === "created" ? (custSettings.orderCreated ?? true) : (custSettings.orderConfirmed ?? true);
    if (custEnabled && order.buyerEmail) {
      const subject = event === "created" ? `Order received - ${storeName}` : `Payment confirmed - ${storeName}`;
      const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">${event === "created" ? "Order received" : "Payment confirmed"}</h2>
        <p style="color:#555">${event === "created"
          ? `Thanks for your order at ${storeName}. We will let you know once your payment is confirmed.`
          : `Your payment for order <b>${orderId}</b> at ${storeName} has been confirmed. Your order is being processed.`}</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin:20px 0">
          <p style="margin:0 0 6px;font-weight:700">${order.productName || "Order"}</p>
          <p style="margin:0;color:#555">Total: ${money(order.amount)}</p>
        </div>
        <a href="${storeUrl}" style="display:inline-block;padding:12px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Visit store</a>
        <p style="color:#999;font-size:12px;margin-top:20px">Powered by ChatFi Pay</p>
      </div>`;
      await sendEmail(order.buyerEmail, subject, html).catch(e => console.error(`Customer ${event} email failed:`, e));
    }

    // Account (merchant) email
    const acctSettings = notif.account || {};
    const acctEnabled = event === "created" ? (acctSettings.orderCreated ?? true) : (acctSettings.orderConfirmed ?? true);
    const acctEmail = acctSettings.notificationEmail || store.contact?.email;
    if (acctEnabled && acctEmail) {
      const subject = event === "created" ? `New order - ${storeName}` : `Order paid - ${storeName}`;
      const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">${event === "created" ? "New order received" : "Order payment confirmed"}</h2>
        <p style="color:#555">Order <b>${orderId}</b> \u2014 ${order.productName || ""}</p>
        <p style="color:#555">Buyer: ${order.buyerName || "N/A"} (${order.buyerEmail || order.buyerPhone || "no contact"})</p>
        <p style="color:#555">Total: ${money(order.amount)}</p>
        <a href="https://store.chatfi.pro/${slug}/dashboard/orders" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">View order</a>
      </div>`;
      await sendEmail(acctEmail, subject, html).catch(e => console.error(`Account ${event} email failed:`, e));
    }
  } catch (e) {
    console.error(`notifyOrderEvent(${event}) failed:`, e);
  }
}
