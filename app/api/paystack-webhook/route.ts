import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const signature = req.headers.get("x-paystack-signature");
    if (!PAYSTACK_SECRET_KEY) {
      console.error("Missing PAYSTACK_SECRET_KEY env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
    if (hash !== signature) {
      console.error("Invalid Paystack webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    if (event.event !== "charge.success") {
      return NextResponse.json({ success: true, ignored: event.event });
    }

    // Wallet top-ups (SMS/email credit purchases) are a different flow from
    // order payments — no order to look up, just credit the store's balance
    // once the amount is confirmed to match what was requested.
    if (event.data?.metadata?.type === "wallet_topup") {
      const { slug: topupSlug, topupId } = event.data.metadata;
      if (!topupSlug || !topupId) {
        return NextResponse.json({ error: "Missing wallet_topup metadata" }, { status: 400 });
      }

      const topupRef = db.collection("stores").doc(topupSlug).collection("walletTopups").doc(topupId);
      const topupSnap = await topupRef.get();
      if (!topupSnap.exists) {
        console.error(`No wallet topup found for ${topupSlug}/${topupId}`);
        return NextResponse.json({ error: "Topup not found" }, { status: 404 });
      }
      const topup = topupSnap.data()!;

      if (topup.status === "completed") {
        return NextResponse.json({ success: true, topupId, alreadyProcessed: true });
      }

      const expectedKobo = Math.round((topup.amount || 0) * 100);
      if (event.data.amount !== expectedKobo) {
        console.error(`Amount mismatch for wallet topup ${topupId}: expected ${expectedKobo}, got ${event.data.amount}`);
        return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
      }

      await db.collection("stores").doc(topupSlug).update({
        walletBalance: FieldValue.increment(topup.amount),
      });
      await topupRef.set({ status: "completed", completedAt: Timestamp.now() }, { merge: true });

      return NextResponse.json({ success: true, topupId, credited: topup.amount });
    }

    const reference = event.data?.reference;
    const slug = event.data?.metadata?.slug;
    let orderId = event.data?.metadata?.orderId;

    if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug in metadata" }, { status: 400 });

    if (!orderId) {
      const matchSnap = await db
        .collection("stores")
        .doc(slug)
        .collection("orders")
        .where("paystackRef", "==", reference)
        .limit(1)
        .get();
      if (matchSnap.empty) {
        console.error(`No order found for Paystack reference ${reference}`);
        return NextResponse.json({ error: "Order not found for reference" }, { status: 404 });
      }
      orderId = matchSnap.docs[0].id;
    }

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    if (order.status === "paid") {
      return NextResponse.json({ success: true, orderId, status: "paid", alreadyProcessed: true });
    }

    const expectedKobo = Math.round((order.amount || 0) * 100);
    if (event.data.amount !== expectedKobo) {
      console.error(`Amount mismatch for order ${orderId}: expected ${expectedKobo}, got ${event.data.amount}`);
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const internalWebhookUrl = new URL(`/api/store/${slug}/webhook`, req.nextUrl.origin).toString();

    const confirmRes = await fetch(internalWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        txSignature: reference,
        receivedAmount: event.data.amount / 100,
        payerWallet: null,
      }),
    });

    if (!confirmRes.ok) {
      const errText = await confirmRes.text();
      console.error("Internal order-paid webhook failed:", errText);
      return NextResponse.json({ error: "Failed to finalize order" }, { status: 500 });
    }

    return NextResponse.json({ success: true, orderId, status: "paid" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
