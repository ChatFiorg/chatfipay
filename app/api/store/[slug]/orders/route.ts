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

// GET /api/store/[slug]/orders
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = db.collection("stores").doc(slug).collection("orders")
      .orderBy("createdAt", "desc").limit(50);

    const snap = await query.get();
    let orders = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
      };
    });

    if (status) orders = orders.filter(o => o.status === status);

    const total = orders.length;
    const paid = orders.filter(o => o.status === "paid").length;
    const pending = orders.filter(o => o.status === "pending").length;
    const volume = orders.filter(o => o.status === "paid").reduce((sum, o) => sum + (o.amount || 0), 0);

    return NextResponse.json({ success: true, orders, stats: { total, paid, pending, volume } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
