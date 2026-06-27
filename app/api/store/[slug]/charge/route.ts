import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

async function getNgnPerUsdc(): Promise<number> {
  try {
    const fxRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const fxData = await fxRes.json();
    const usdNgn = fxData?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const usdNgn = data?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=NGN');
    const data = await res.json();
    const usdNgn = data?.rates?.NGN;
    if (usdNgn && usdNgn > 100) return usdNgn;
  } catch {}
  return 1600;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const body = await req.json();
    const { productId, buyerEmail, buyerWallet, buyerDelivery } = body;

    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    const productSnap = await db.collection("stores").doc(slug).collection("products").doc(productId).get();
    if (!productSnap.exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const product = productSnap.data()!;
    if (!product.active) return NextResponse.json({ error: "Product unavailable" }, { status: 400 });

    const ngnPerUsdc = await getNgnPerUsdc();
    const amountUsdc = Math.round((product.price / ngnPerUsdc) * 100) / 100;

    const orderId = crypto.randomBytes(8).toString("hex");
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60000);
    const payLinkId = crypto.randomBytes(8).toString("hex");

    await db.collection("pay_links").doc(payLinkId).set({
      merchantId: slug,
      walletAddress: store.ownerWallet,
      amount: amountUsdc,
      token: "USDC",
      label: `${product.name} x1`,
      memo: `Order ${orderId} - ${store.name}`,
      status: "pending",
      storeOrder: true,
      storeSlug: slug,
      orderId,
      idempotencyKey: null,
      createdAt: now,
      expiresAt,
      paidAt: null,
      txSignature: null,
      payerWallet: buyerWallet || null,
      receivedAmount: null,
      buyerDelivery: buyerDelivery || null,
      ngnPerUsdc,
    });

    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
      id: orderId,
      productId,
      productName: product.name,
      buyerWallet: buyerWallet || null,
      buyerEmail: buyerEmail || null,
      buyerDelivery: buyerDelivery || null,
      amount: product.price,
      amountUsdc,
      ngnPerUsdc,
      status: "pending",
      paymentRef: payLinkId,
      chatfiPaySlug: payLinkId,
      createdAt: now,
      paidAt: null,
    });

    await db.collection("storeKeys").doc(slug).update({ lastUsed: now });

    return NextResponse.json({
      success: true,
      orderId,
      paymentLink: `https://pay.chatfi.pro/pay/${payLinkId}`,
      amountNgn: product.price,
      amountUsdc,
      ngnPerUsdc,
      product: product.name,
      status: "pending",
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
