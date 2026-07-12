import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/customers/[phone] — one customer + their order history
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const custSnap = await db.collection("stores").doc(slug).collection("customers").doc(phone).get();
    if (!custSnap.exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const customer = custSnap.data()!;

    const ordersSnap = await db.collection("stores").doc(slug).collection("orders")
      .where("customerKey", "==", phone)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const orders = ordersSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        items: data.items || (data.productId ? [{ productId: data.productId, productName: data.productName, quantity: data.quantity || 1 }] : []),
        amount: data.amount,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({
      success: true,
      customer: {
        id: phone,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        address: customer.address,
        totalSpent: customer.totalSpent || 0,
        orderCount: customer.orderCount || 0,
        tags: customer.tags || [],
        notes: customer.notes || '',
        firstOrderAt: customer.firstOrderAt?.toDate?.()?.toISOString() || null,
        lastOrderAt: customer.lastOrderAt?.toDate?.()?.toISOString() || null,
      },
      orders,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/store/[slug]/customers/[phone] — update a customer's tags/notes (owner only)
// body: { tags?: string[], notes?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const update: any = {};
    if (Array.isArray(body.tags)) {
      update.tags = body.tags.map((t: any) => String(t).trim()).filter(Boolean);
    }
    if (body.notes !== undefined) {
      update.notes = String(body.notes || "").slice(0, 2000);
    }

    const custRef = db.collection("stores").doc(slug).collection("customers").doc(phone);
    const custSnap = await custRef.get();
    if (!custSnap.exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    await custRef.set(update, { merge: true });
    return NextResponse.json({ success: true, tags: update.tags, notes: update.notes });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
