import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyBuyerToken } from "@/lib/buyerAuth";

// GET /api/store/[slug]/auth/me — Authorization: Bearer <token>
// Returns the logged-in buyer's account summary + full order history.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyBuyerToken(token);

  if (!payload || payload.slug !== slug) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Query by buyerEmailNormalized, not customerKey — customerKey prefers
    // phone when both exist (checkout usually requires phone), so it can
    // point at a different customer doc than the buyer's own login email.
    // buyerEmailNormalized is always stamped with the authenticated email
    // regardless of which field won the customerKey race, so it reliably
    // finds every order tied to this buyer's account.
    const ordersSnap = await db.collection("stores").doc(slug).collection("orders")
      .where("buyerEmailNormalized", "==", payload.email)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    let totalSpent = 0;
    let orderCount = 0;
    let name: string | null = null;
    let phone: string | null = null;
    let address: string | null = null;

    const orders = ordersSnap.docs.map(d => {
      const data = d.data();
      if (data.status === "paid") {
        totalSpent += data.amount || 0;
        orderCount += 1;
      }
      if (!name && data.buyerName) name = data.buyerName;
      if (!phone && data.buyerPhone) phone = data.buyerPhone;
      if (!address && (data.buyerAddress || data.buyerDelivery)) address = data.buyerAddress || data.buyerDelivery;
      return {
        id: d.id,
        items: data.items || (data.productId ? [{ productId: data.productId, productName: data.productName, quantity: data.quantity || 1 }] : []),
        amount: data.amount,
        status: data.status,
        fulfillmentStatus: data.fulfillmentStatus || null,
        shippingStatus: data.shippingStatus || null,
        trackingCode: data.trackingCode || null,
        trackingUrl: data.trackingUrl || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
      };
    });

    const response = NextResponse.json({
      success: true,
      email: payload.email,
      account: { name, phone, address, totalSpent, orderCount },
      orders,
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
