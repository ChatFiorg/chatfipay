import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";

const VALID_TOKENS = ["SOL", "USDC", "USDT"];
const DEFAULT_EXPIRY_MINUTES = 60 * 24;

async function getMerchantByApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  const snap = await db
    .collection("pay_merchants")
    .where("apiKey", "==", apiKey)
    .where("revoked", "==", false)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as { id: string; walletAddress: string; [key: string]: any };
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const idempotencyKey = req.headers.get("idempotency-key");
  const merchant = await getMerchantByApiKey(apiKey);

  if (!merchant) {
    return NextResponse.json({ success: false, error: "Invalid or revoked API key" }, { status: 401 });
  }

  const body = await req.json();
  const { amount, label, memo, expiresInMinutes } = body;
  const token = (body.token || "SOL").toUpperCase();

  if (!VALID_TOKENS.includes(token)) {
    return NextResponse.json(
      { success: false, error: "token must be one of " + VALID_TOKENS.join(", ") },
      { status: 400 }
    );
  }

  if (idempotencyKey) {
    const existing = await db
      .collection("pay_links")
      .where("merchantId", "==", merchant.id)
      .where("idempotencyKey", "==", idempotencyKey)
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return NextResponse.json({ success: true, ...doc.data(), id: doc.id, idempotent: true });
    }
  }

  const id = crypto.randomBytes(8).toString("hex");
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + (expiresInMinutes || DEFAULT_EXPIRY_MINUTES) * 60000
  );

  const paymentDoc = {
    merchantId: merchant.id,
    walletAddress: merchant.walletAddress,
    amount: amount != null ? amount : null,
    token: token,
    label: label || null,
    memo: memo || null,
    status: "pending",
    idempotencyKey: idempotencyKey || null,
    createdAt: now,
    expiresAt: expiresAt,
    paidAt: null,
    txSignature: null,
    payerWallet: null,
    receivedAmount: null,
  };

  await db.collection("pay_links").doc(id).set(paymentDoc);

  return NextResponse.json({
    success: true,
    id: id,
    link: "https://chatfipay-z9xh.vercel.app/pay/" + id,
    amount: amount != null ? amount : null,
    token: token,
    label: label || null,
    status: "pending",
    expiresAt: expiresAt.toDate().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const merchant = await getMerchantByApiKey(apiKey);
  if (!merchant) {
    return NextResponse.json({ success: false, error: "Invalid or revoked API key" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const docRef = db.collection("pay_links").doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
  }

  const data = doc.data();

  if (data.status === "pending" && data.expiresAt.toMillis() < Date.now()) {
    await docRef.update({ status: "expired" });
    data.status = "expired";
  }

  return NextResponse.json({
    id: doc.id,
    status: data.status,
    amount: data.amount,
    token: data.token,
    label: data.label,
    paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
    txSignature: data.txSignature,
    receivedAmount: data.receivedAmount,
  });
}
