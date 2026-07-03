import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "234" + digits.slice(1);
  else if (!digits.startsWith("234")) digits = "234" + digits;
  return digits;
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

// POST /api/store/[slug]/webhook — called by ChatFi Pay on payment confirmed
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { orderId, txSignature, receivedAmount, payerWallet } = body;

    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;
    const now = Timestamp.now();

    // Avoid double-processing if the webhook somehow fires twice for the same order
    if (order.status === "paid") {
      return NextResponse.json({ success: true, orderId, status: "paid", alreadyProcessed: true });
    }

    const normalizedPhone = normalizePhone(order.buyerPhone);
    const normalizedEmail = normalizeEmail(order.buyerEmail);
    const customerKey = normalizedPhone || normalizedEmail;

    await orderRef.update({
      status: "paid",
      txSignature: txSignature || null,
      receivedAmount: receivedAmount || null,
      payerWallet: payerWallet || null,
      paidAt: now,
      buyerPhoneNormalized: normalizedPhone,
      buyerEmailNormalized: normalizedEmail,
      customerKey,
    });

    if (order.paymentRef) {
      await db.collection("pay_links").doc(order.paymentRef).update({
        status: "completed",
        paidAt: now,
        txSignature: txSignature || null,
        receivedAmount: receivedAmount || null,
      });
    }

    // Upsert the customer record (CRM) — keyed on phone when available, else email
    if (customerKey) {
      const custRef = db.collection("stores").doc(slug).collection("customers").doc(customerKey);
      const custSnap = await custRef.get();
      const custUpdate: any = {
        phone: order.buyerPhone || null,
        name: order.buyerName || null,
        email: order.buyerEmail || null,
        address: order.buyerAddress || order.buyerDelivery || null,
        totalSpent: FieldValue.increment(order.amount || 0),
        orderCount: FieldValue.increment(1),
        lastOrderAt: now,
      };
      if (!custSnap.exists) custUpdate.firstOrderAt = now;
      await custRef.set(custUpdate, { merge: true });
    }

    // Update store-level stats (analytics)
    const dayKey = now.toDate().toISOString().slice(0, 10); // YYYY-MM-DD
    await db.collection("stores").doc(slug).collection("stats").doc("summary").set({
      totalRevenue: FieldValue.increment(order.amount || 0),
      totalOrders: FieldValue.increment(1),
    }, { merge: true });
    await db.collection("stores").doc(slug).collection("dailyStats").doc(dayKey).set({
      date: dayKey,
      revenue: FieldValue.increment(order.amount || 0),
      orders: FieldValue.increment(1),
    }, { merge: true });

    // Prefer the explicit stockDeductions computed at checkout (handles
    // bundles, where stock lives on child products rather than the bundle
    // itself). Falls back to the older `items`/`productId` derivation for
    // orders created before this field existed, so nothing breaks.
    const stockDeductions: { productId: string; quantity: number }[] =
      Array.isArray(order.stockDeductions) && order.stockDeductions.length > 0
        ? order.stockDeductions
        : Array.isArray(order.items) && order.items.length > 0
          ? order.items.map((it: any) => ({ productId: it.productId, quantity: it.quantity || 1 }))
          : order.productId
            ? [{ productId: order.productId, quantity: order.quantity || 1 }]
            : [];

    for (const item of stockDeductions) {
      if (!item.productId) continue;
      const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) continue;

      const product = productSnap.data()!;
      if (product.stock == null) {
        await productRef.update({ unitsSold: FieldValue.increment(item.quantity) });
        continue; // unlimited stock, nothing to deduct
      }

      const newStock = Math.max(0, product.stock - item.quantity);
      const update: any = { stock: FieldValue.increment(-Math.min(item.quantity, product.stock)), unitsSold: FieldValue.increment(item.quantity) };
      if (newStock === 0) update.active = false;
      await productRef.update(update);
    }

    return NextResponse.json({ success: true, orderId, status: "paid" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
