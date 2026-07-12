import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// GET /api/store/[slug]/track/[orderId] — public, no api key (customer-facing)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;

  try {
    const orderSnap = await db.collection("stores").doc(slug).collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      const res = NextResponse.json({ error: "Order not found" }, { status: 404 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }

    const order = orderSnap.data()!;
    const res = NextResponse.json({
      orderId,
      productName: order.productName || null,
      status: order.status,
      fulfillmentStatus: order.status === "paid" ? (order.fulfillmentStatus || "processing") : null,
      shippingStatus: order.shippingStatus || null,
      trackingCode: order.trackingCode || null,
      trackingUrl: order.trackingUrl || null,
      amount: order.amount || null,
      createdAt: order.createdAt?.toDate?.()?.toISOString() || null,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e) {
    console.error(e);
    const res = NextResponse.json({ error: "Server error" }, { status: 500 });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
