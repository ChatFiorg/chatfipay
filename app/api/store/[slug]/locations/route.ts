import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/locations — list locations for this store (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("locations").orderBy("createdAt", "asc").get();
    const locations = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        address: data.address || null,
        active: data.active !== false,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, locations });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/locations — create a location (owner only)
// body: { name, address? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Location name is required" }, { status: 400 });

    const now = Timestamp.now();
    const ref = await db.collection("stores").doc(slug).collection("locations").add({
      name,
      address: body.address ? String(body.address).trim() : null,
      active: true,
      createdAt: now,
    });

    return NextResponse.json({ success: true, id: ref.id, name, address: body.address || null, active: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
