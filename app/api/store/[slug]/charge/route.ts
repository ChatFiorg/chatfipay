import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// POST /api/store/[slug]/charge
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const body = await req.json();
    const { productId, buyerEmail, buyerWallet } = body;

    if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

    // Get store
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;

    // Get product
    const productSnap = await db.collection("stores").doc(slug).collection("products").doc(productId).get();
    if (!productSnap.exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const product = productSnap.data()!;
    if (!product.active) return NextResponse.json({ error: "Product unavailable" }, { status: 400 });

    // Create order
    const orderId = crypto.randomBytes(8).toString("hex");
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60000);

    // Create ChatFi Pay payment link
    const payLinkId = crypto.randomBytes(8).toString("hex");
    await db.collection("pay_links").doc(payLinkId).set({
      merchantId: slug,
      walletAddress: store.ownerWallet,
      amount: product.price,
      token: "USDC",
      label: product.name,
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

    // Save order
    await db.collection("stores").doc(slug).collection("orders").doc(orderId).set({
      id: orderId,
      productId,
      productName: product.name,
      buyerWallet: buyerWallet || null,
      buyerEmail: buyerEmail || null,
      amount: product.price,
      status: "pending",
      paymentRef: payLinkId,
      chatfiPaySlug: payLinkId,
      createdAt: now,
      paidAt: null,
    });

    // Update storeKeys lastUsed
    await db.collection("storeKeys").doc(slug).update({ lastUsed: now });

    return NextResponse.json({
      success: true,
      orderId,
      paymentLink: `https://pay.chatfi.pro/pay/${payLinkId}`,
      amount: product.price,
      product: product.name,
      status: "pending",
      expiresAt: expiresAt.toDate().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
