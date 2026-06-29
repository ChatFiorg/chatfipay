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

    await orderRef.update({
      status: "paid",
      txSignature: txSignature || null,
      receivedAmount: receivedAmount || null,
      payerWallet: payerWallet || null,
      paidAt: now,
      buyerPhoneNormalized: normalizedPhone,
    });

    if (order.paymentRef) {
      await db.collection("pay_links").doc(order.paymentRef).update({
        status: "completed",
        paidAt: now,
        txSignature: txSignature || null,
        receivedAmount: receivedAmount || null,
      });
    }

    // Upsert the customer record (CRM)
    if (normalizedPhone) {
      const custRef = db.collection("stores").doc(slug).collection("customers").doc(normalizedPhone);
      const custSnap = await custRef.get();
      const custUpdate: any = {
        phone: order.buyerPhone,
        name: order.buyerName || null,
        email: order.buyerEmail || null,
        address: order.buyerAddress || null,
        totalSpent: FieldValue.increment(order.amount || 0),
        orderCount: FieldValue.increment(1),
        lastOrderAt: now,
      };
      if (!custSnap.exists) custUpdate.firstOrderAt = now;
      await custRef.set(custUpdate, { merge: true });
    }

    // Support both the current multi-item `items` array and legacy single-product orders
    const lineItems: { productId: string; quantity: number }[] = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map((it: any) => ({ productId: it.productId, quantity: it.quantity || 1 }))
      : order.productId
        ? [{ productId: order.productId, quantity: order.quantity || 1 }]
        : [];

    for (const item of lineItems) {
      if (!item.productId) continue;
      const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) continue;

      const product = productSnap.data()!;
      if (product.stock == null) continue; // unlimited stock, nothing to deduct

      const newStock = Math.max(0, product.stock - item.quantity);
      const update: any = { stock: FieldValue.increment(-Math.min(item.quantity, product.stock)) };
      if (newStock === 0) update.active = false;
      await productRef.update(update);
    }

    return NextResponse.json({ success: true, orderId, status: "paid" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
