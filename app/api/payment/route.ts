import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { derivePaymentAddress } from "@/lib/derivedWallet";
import { fundDepositAddress } from "@/lib/fundDeposit";

const VALID_TOKENS = ["SOL", "USDC", "USDT"];
const DEFAULT_EXPIRY_MINUTES = 60 * 24;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, idempotency-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function getMerchantByApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  const snap = await db
    .collection("merchants")
    .where("apiKey", "==", apiKey)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.revoked === true) return null;
  return { id: doc.id, walletAddress: data.walletAddress || doc.id, ...data } as { id: string; walletAddress: string; [key: string]: any };
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const idempotencyKey = req.headers.get("idempotency-key");
  const merchant = await getMerchantByApiKey(apiKey);

  if (!merchant) {
    return NextResponse.json({ success: false, error: "Invalid or revoked API key" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await req.json();
  const { amount, label, memo, expiresInMinutes } = body;
  const token = (body.token || "SOL").toUpperCase();

  if (!VALID_TOKENS.includes(token)) {
    return NextResponse.json(
      { success: false, error: "token must be one of " + VALID_TOKENS.join(", ") },
      { status: 400, headers: CORS_HEADERS }
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
      return NextResponse.json({ success: true, ...doc.data(), id: doc.id, idempotent: true }, { headers: CORS_HEADERS });
    }
  }

  const id = crypto.randomBytes(8).toString("hex");
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + (expiresInMinutes || DEFAULT_EXPIRY_MINUTES) * 60000
  );

  const depositAddress = derivePaymentAddress(id);
  try {
    await fundDepositAddress(depositAddress);
  } catch (e) {
    console.error("Failed to fund deposit address (sweep will fail later):", e);
  }

  const paymentDoc = {
    merchantId: merchant.id,
    walletAddress: depositAddress,
    merchantWallet: merchant.walletAddress,
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
    link: "https://pay.chatfi.pro/pay/" + id,
    amount: amount != null ? amount : null,
    token: token,
    label: label || null,
    status: "pending",
    expiresAt: expiresAt.toDate().toISOString(),
  }, { headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const merchant = await getMerchantByApiKey(apiKey);
  if (!merchant) {
    return NextResponse.json({ success: false, error: "Invalid or revoked API key" }, { status: 401, headers: CORS_HEADERS });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS_HEADERS });
  }

  const docRef = db.collection("pay_links").doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404, headers: CORS_HEADERS });
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
  }, { headers: CORS_HEADERS });
}
