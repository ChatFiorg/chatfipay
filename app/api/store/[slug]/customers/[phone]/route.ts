import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

// GET /api/store/[slug]/customers/[phone] — one customer + their order history
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

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

// PATCH /api/store/[slug]/customers/[phone] — update a customer's tags (owner only)
// body: { tags: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; phone: string }> }) {
  const { slug, phone } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const body = await req.json();
    const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    const custRef = db.collection("stores").doc(slug).collection("customers").doc(phone);
    const custSnap = await custRef.get();
    if (!custSnap.exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    await custRef.set({ tags }, { merge: true });
    return NextResponse.json({ success: true, tags });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
