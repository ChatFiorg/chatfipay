import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

// POST /api/store/[slug]/charge — public checkout endpoint, no API key needed
// Accepts either a single { productId, quantity } (legacy) or { items: [{ productId, quantity }] } (cart)
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = await req.json();
    const { buyerName, buyerPhone, buyerAddress, buyerEmail, buyerWallet } = body;

    let items: { productId: string; quantity: number }[] = body.items;
    if (!items && body.productId) {
      items = [{ productId: body.productId, quantity: body.quantity || 1 }];
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing items" }, { status: 400 });
    }
    if (!buyerName || !buyerPhone || !buyerAddress) {
      return NextResponse.json({ error: "Name, phone, and address are required" }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    if (!store.live) return NextResponse.json({ error: "Store is offline" }, { status: 403 });

    let amount = 0;
    const lineItems: { productId: string; productName: string; quantity: number; price: number }[] = [];

    for (const it of items) {
      const qty = Math.max(1, parseInt(String(it.quantity), 10) || 1);
      const productSnap = await db.collection("stores").doc(slug).collection("products").doc(it.productId).get();
      if (!productSnap.exists) return NextResponse.json({ error: `Product not found: ${it.productId}` }, { status: 404 });
      const product = productSnap.data()!;
      if (!product.active) return NextResponse.json({ error: `Product unavailable: ${product.name}` }, { status: 400 });
      if (product.stock !== null && product.stock !== undefined && qty > product.stock) {
        return NextResponse.json({ error: `Only ${product.stock} left of ${product.name}` }, { status: 400 });
      }
      amount += product.price * qty;
      lineItems.push({ productId: it.productId, productName: product.name, quantity: qty, price: product.price });
    }

    const orderId = crypto.randomBytes(8).toString("hex");
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60000);

    const label = lineItems.length === 1
      ? `${lineItems[0].productName} x${lineItems[0].quantity}`
      : `${lineItems.length} items`;

    const payLinkId = crypto.randomBytes(8).toString("hex");
    await db.collection("pay_links").doc(payLinkId).set({
      merchantId: slug,
      walletAddress: store.ownerWallet,
      amount,
      token: "USDC",
      label,
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
    });

    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
      id: orderId,
      items: lineItems,
      amount,
      buyerName,
      buyerPhone,
      buyerAddress,
      buyerEmail: buyerEmail || null,
      buyerWallet: buyerWallet || null,
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
      amount,
      items: lineItems,
      status: "pending",
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
