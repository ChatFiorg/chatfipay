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

// GET /api/store/[slug]/customers — list customers for this store, sorted by most recent order
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    let snap;
    try {
      snap = await db.collection("stores").doc(slug).collection("customers")
        .orderBy("lastOrderAt", "desc").limit(200).get();
    } catch {
      // Fallback without ordering if index not ready
      snap = await db.collection("stores").doc(slug).collection("customers")
        .limit(200).get();
    }

    const customers = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        phone: data.phone,
        name: data.name,
        email: data.email,
        address: data.address,
        totalSpent: data.totalSpent || 0,
        orderCount: data.orderCount || 0,
        firstOrderAt: data.firstOrderAt?.toDate?.()?.toISOString() || null,
        lastOrderAt: data.lastOrderAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, customers, total: customers.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
