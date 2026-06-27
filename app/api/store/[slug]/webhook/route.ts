import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

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

    const now = Timestamp.now();

    // Update order to paid
    await orderRef.update({
      status: "paid",
      txSignature: txSignature || null,
      receivedAmount: receivedAmount || null,
      payerWallet: payerWallet || null,
      paidAt: now,
    });

    // Update pay_link status
    const order = orderSnap.data()!;
    if (order.paymentRef) {
      await db.collection("pay_links").doc(order.paymentRef).update({
        status: "completed",
        paidAt: now,
        txSignature: txSignature || null,
        receivedAmount: receivedAmount || null,
      });
    }

    // Deduct stock if limited
    const productRef = db.collection("stores").doc(slug).collection("products").doc(order.productId);
    const productSnap = await productRef.get();
    if (productSnap.exists) {
      const product = productSnap.data()!;
      if (product.stock != null && product.stock > 0) {
        await productRef.update({ stock: product.stock - 1 });
        if (product.stock - 1 === 0) {
          await productRef.update({ active: false });
        }
      }
    }

    return NextResponse.json({ success: true, orderId, status: "paid" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
