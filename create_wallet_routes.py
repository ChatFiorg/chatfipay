balance_route = '''import { NextRequest, NextResponse } from "next/server";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { getWalletBalance } from "@/lib/wallet";

// GET /api/store/[slug]/wallet — current ChatFi credit balance for SMS/email sends.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const balance = await getWalletBalance(slug);
    return NextResponse.json({ balance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
'''

with open("app/api/store/[slug]/wallet/route.ts", "w", encoding="utf-8") as f:
    f.write(balance_route)
print("Created app/api/store/[slug]/wallet/route.ts")

topup_route = '''import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import { verifyStoreAccess } from "@/lib/storeAccess";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const MIN_TOPUP_NGN = 500;

// POST /api/store/[slug]/wallet/topup — starts a Paystack charge that credits
// the store's ChatFi wallet balance (used for SMS/email sends), NOT a
// customer order. No subaccount split here — unlike checkout charges, this
// money goes straight to ChatFi's own Paystack account.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!PAYSTACK_SECRET_KEY) {
    console.error("Missing PAYSTACK_SECRET_KEY env var");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const amount = Math.round(Number(body.amount) || 0);
    const email = String(body.email || "").trim();

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    if (!amount || amount < MIN_TOPUP_NGN) {
      return NextResponse.json({ error: `Minimum top-up is \u20a6${MIN_TOPUP_NGN}` }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const topupId = crypto.randomBytes(8).toString("hex");
    const reference = `wallettopup_${slug}_${topupId}_${Date.now()}`;
    const now = Timestamp.now();

    await db.collection("stores").doc(slug).collection("walletTopups").doc(topupId).set({
      id: topupId,
      amount,
      reference,
      status: "pending",
      createdAt: now,
    });

    const initRes = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amount * 100,
        reference,
        // No `subaccount` field — this charge is billed to ChatFi directly.
        metadata: { type: "wallet_topup", slug, topupId },
      }),
    });
    const initData = await initRes.json();

    if (!initRes.ok || !initData.status) {
      await db.collection("stores").doc(slug).collection("walletTopups").doc(topupId).set(
        { status: "failed" },
        { merge: true }
      );
      return NextResponse.json({ error: initData.message || "Could not initialize payment" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      topupId,
      reference,
      authorizationUrl: initData.data.authorization_url,
      accessCode: initData.data.access_code,
      amount,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
'''

with open("app/api/store/[slug]/wallet/topup/route.ts", "w", encoding="utf-8") as f:
    f.write(topup_route)
print("Created app/api/store/[slug]/wallet/topup/route.ts")
