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

export type OrderEvent = "created" | "confirmed" | "shippedDelivered" | "cancelled" | "awaitingShipping" | "orderPacked" | "orderPickedUp" | "orderReturned";

const CUSTOMER_COPY: Record<OrderEvent, { settingKey: string; defaultOn: boolean; subject: (storeName: string) => string; heading: string; body: (storeName: string, orderId: string) => string }> = {
  created: {
    settingKey: "orderCreated",
    defaultOn: true,
    subject: (storeName) => `Order received - ${storeName}`,
    heading: "Order received",
    body: (storeName) => `Thanks for your order at ${storeName}. We will let you know once your payment is confirmed.`,
  },
  confirmed: {
    settingKey: "orderConfirmed",
    defaultOn: true,
    subject: (storeName) => `Payment confirmed - ${storeName}`,
    heading: "Payment confirmed",
    body: (storeName, orderId) => `Your payment for order <b>${orderId}</b> at ${storeName} has been confirmed. Your order is being processed.`,
  },
  shippedDelivered: {
    settingKey: "shippedDelivered",
    defaultOn: true,
    subject: (storeName) => `Your order is on the way - ${storeName}`,
    heading: "Order shipped",
    body: (storeName, orderId) => `Good news! Order <b>${orderId}</b> at ${storeName} has been shipped and/or delivered.`,
  },
  cancelled: {
    settingKey: "orderCancelled",
    defaultOn: true,
    subject: (storeName) => `Order cancelled - ${storeName}`,
    heading: "Order cancelled",
    body: (storeName, orderId) => `Your order <b>${orderId}</b> at ${storeName} has been cancelled. If you were charged, please contact the store for next steps.`,
  },
  awaitingShipping: {
    settingKey: "awaitingShipping",
    defaultOn: false,
    subject: (storeName) => `Your order is awaiting shipping - ${storeName}`,
    heading: "Awaiting shipping",
    body: (storeName, orderId) => `Order <b>${orderId}</b> at ${storeName} is packed and awaiting pickup by the courier.`,
  },
  orderPacked: {
    settingKey: "orderPacked",
    defaultOn: false,
    subject: (storeName) => `Your order has been packed - ${storeName}`,
    heading: "Order packed",
    body: (storeName, orderId) => `Order <b>${orderId}</b> at ${storeName} has been packed and is ready for shipping.`,
  },
  orderPickedUp: {
    settingKey: "orderPickedUp",
    defaultOn: false,
    subject: (storeName) => `Your order has been picked up - ${storeName}`,
    heading: "Order picked up",
    body: (storeName, orderId) => `Order <b>${orderId}</b> at ${storeName} has been picked up.`,
  },
  orderReturned: {
    settingKey: "orderReturned",
    defaultOn: false,
    subject: (storeName) => `Your order has been returned - ${storeName}`,
    heading: "Order returned",
    body: (storeName, orderId) => `Order <b>${orderId}</b> at ${storeName} has been marked as returned.`,
  },
};

// Fires customer + account notification emails for an order lifecycle event.
// Reads store.globalSettings.notifications to decide who should receive what.
// Never throws — a notification failure should never break checkout, the
// payment webhook, or fulfillment updates, so every failure path is caught
// and logged instead.
export async function notifyOrderEvent(slug: string, orderId: string, event: OrderEvent): Promise<void> {
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
    const copy = CUSTOMER_COPY[event];
    const custEnabled = custSettings[copy.settingKey] ?? copy.defaultOn;
    if (custEnabled && order.buyerEmail) {
      const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:4px">${copy.heading}</h2>
        <p style="color:#555">${copy.body(storeName, orderId)}</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin:20px 0">
          <p style="margin:0 0 6px;font-weight:700">${order.productName || "Order"}</p>
          <p style="margin:0;color:#555">Total: ${money(order.amount)}</p>
        </div>
        <a href="${storeUrl}" style="display:inline-block;padding:12px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Visit store</a>
        <p style="color:#999;font-size:12px;margin-top:20px">Powered by ChatFi Pay</p>
      </div>`;
      await sendEmail(order.buyerEmail, copy.subject(storeName), html).catch(e => console.error(`Customer ${event} email failed:`, e));
    }

    // Account (merchant) email — only for created/confirmed per Bumpa's Account Notifications tab
    if (event === "created" || event === "confirmed") {
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

      // Staff emails — sent to every staff member with manage-order permission,
      // per Bumpa's "staff with manage order access" wording.
      const staffSettings = notif.staff || {};
      const staffEnabled = event === "created" ? !!staffSettings.orderCreated : !!staffSettings.orderConfirmed;
      if (staffEnabled) {
        try {
          const staffSnap = await db.collection("stores").doc(slug).collection("staff").where("permissions.orders", "==", true).get();
          const subject = event === "created" ? `New order - ${storeName}` : `Order paid - ${storeName}`;
          const html = `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="margin-bottom:4px">${event === "created" ? "New order received" : "Order payment confirmed"}</h2>
            <p style="color:#555">Order <b>${orderId}</b> \u2014 ${order.productName || ""}</p>
            <p style="color:#555">Buyer: ${order.buyerName || "N/A"} (${order.buyerEmail || order.buyerPhone || "no contact"})</p>
            <p style="color:#555">Total: ${money(order.amount)}</p>
            <a href="https://store.chatfi.pro/${slug}/dashboard/orders" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">View order</a>
          </div>`;
          for (const staffDoc of staffSnap.docs) {
            const staffEmail = staffDoc.id;
            if (staffEmail === acctEmail) continue; // avoid duplicate if owner is also listed as staff
            await sendEmail(staffEmail, subject, html).catch(e => console.error(`Staff ${event} email failed for ${staffEmail}:`, e));
          }
        } catch (e) {
          console.error(`Staff ${event} notification lookup failed:`, e);
        }
      }
    }
  } catch (e) {
    console.error(`notifyOrderEvent(${event}) failed:`, e);
  }
}
