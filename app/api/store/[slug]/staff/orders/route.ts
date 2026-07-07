import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";

// GET /api/store/[slug]/staff/orders — Authorization: Bearer <staff token OR owner token>
// Requires permissions.orders.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const auth = await resolveStaffOrOwner(token, slug);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.permissions.orders) {
    return NextResponse.json({ error: "You don't have permission to view orders" }, { status: 403 });
  }

  try {
    const snap = await db.collection("stores").doc(slug).collection("orders")
      .orderBy("createdAt", "desc").limit(100).get();

    const orders = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        items: data.items || (data.productId ? [{ productId: data.productId, productName: data.productName, quantity: data.quantity || 1 }] : []),
        buyerName: data.buyerName || null,
        buyerPhone: data.buyerPhone || null,
        amount: data.amount,
        status: data.status,
        fulfillmentStatus: data.fulfillmentStatus || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
      };
    });

    const paid = orders.filter(o => o.status === "paid").length;
    const pending = orders.filter(o => o.status === "pending").length;
    const volume = orders.filter(o => o.status === "paid").reduce((sum, o) => sum + (o.amount || 0), 0);

    return NextResponse.json({ success: true, orders, stats: { total: orders.length, paid, pending, volume } });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
