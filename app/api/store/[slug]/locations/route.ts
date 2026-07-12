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
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        terminalAddressId: data.terminalAddressId || null,
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
    const doc: any = {
      name,
      address: body.address ? String(body.address).trim() : null,
      active: true,
      createdAt: now,
      firstName: body.firstName ? String(body.firstName).trim() : null,
      lastName: body.lastName ? String(body.lastName).trim() : null,
      email: body.email ? String(body.email).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      city: body.city ? String(body.city).trim() : null,
      state: body.state ? String(body.state).trim() : null,
      zip: body.zip ? String(body.zip).trim() : null,
      terminalAddressId: null,
    };
    const ref = await db.collection("stores").doc(slug).collection("locations").add(doc);

    return NextResponse.json({ success: true, id: ref.id, ...doc, createdAt: now.toDate().toISOString() });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
