import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/customers — list customers for this store, sorted by most recent order
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        tags: data.tags || [],
        notes: data.notes || '',
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
