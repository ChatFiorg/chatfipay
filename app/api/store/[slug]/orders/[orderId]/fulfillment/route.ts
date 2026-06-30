import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

const VALID_STAGES = ["processing", "shipped", "delivered"];

// PATCH /api/store/[slug]/orders/[orderId]/fulfillment
// body: { fulfillmentStatus: 'processing' | 'shipped' | 'delivered' }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const body = await req.json();
    const { fulfillmentStatus } = body;

    if (!VALID_STAGES.includes(fulfillmentStatus)) {
      return NextResponse.json({ error: "Invalid fulfillment status" }, { status: 400 });
    }

    const orderRef = db.collection("stores").doc(slug).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const order = orderSnap.data()!;
    if (order.status !== "paid") {
      return NextResponse.json({ error: "Order must be paid before updating fulfillment" }, { status: 400 });
    }

    const now = Timestamp.now();
    const update: any = {
      fulfillmentStatus,
      [`fulfillmentTimestamps.${fulfillmentStatus}`]: now,
    };

    await orderRef.set(update, { merge: true });

    return NextResponse.json({ success: true, fulfillmentStatus });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
