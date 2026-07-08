import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;

  try {
    const body = await req.json();
    const { email, callbackUrl } = body;

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    if (!PAYSTACK_SECRET_KEY) {
      console.error("Missing PAYSTACK_SECRET_KEY env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;
    if (order.status === "paid") {
      return NextResponse.json({ error: "Order already paid" }, { status: 409 });
    }
    if (!order.amount || order.amount <= 0) {
      return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const ownerWallet = storeSnap.data()!.ownerWallet;
    if (!ownerWallet) return NextResponse.json({ error: "Store has no owner wallet" }, { status: 400 });

    const payoutAccount = storeSnap.data()!.payoutAccount || {};
    if (!payoutAccount.subaccountCode || !payoutAccount.verified) {
      return NextResponse.json(
        { error: "Merchant has not connected a payout bank account yet" },
        { status: 400 }
      );
    }
    const subaccountCode = payoutAccount.subaccountCode;

    const reference = `chatfi_${orderId}_${Date.now()}`;
    const amountKobo = Math.round(order.amount * 100);

    const initRes = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        subaccount: subaccountCode,
        callback_url: callbackUrl || undefined,
        metadata: {
          slug,
          orderId,
        },
      }),
    });
    const initData = await initRes.json();

    if (!initRes.ok || !initData.status) {
      return NextResponse.json(
        { error: initData.message || "Could not initialize payment" },
        { status: 400 }
      );
    }

    await orderRef.set(
      {
        paymentMethod: "naira",
        paystackRef: reference,
        paymentStatus: "pending",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      authorizationUrl: initData.data.authorization_url,
      accessCode: initData.data.access_code,
      reference,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
