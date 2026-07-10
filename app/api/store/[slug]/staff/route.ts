import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeEmail } from "@/lib/staffAuth";
import { sendStaffInviteEmail } from "@/lib/staffAuth";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/staff — list staff for this store (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("staff").orderBy("invitedAt", "desc").get();
    const staff = snap.docs.map(d => {
      const data = d.data();
      return {
        email: d.id,
        name: data.name || null,
        permissions: data.permissions || { orders: false, products: false, analytics: false },
        status: data.status || "invited",
        invitedAt: data.invitedAt?.toDate?.()?.toISOString() || null,
        lastLoginAt: data.lastLoginAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, staff });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/staff — invite a new staff member (owner only)
// body: { email, permissions: { orders: bool, products: bool } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Valid email required" }, { status: 400 });

    const permissions = {
      orders: !!body.permissions?.orders,
      products: !!body.permissions?.products,
      analytics: !!body.permissions?.analytics,
    };

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;

    const now = Timestamp.now();
    await db.collection("stores").doc(slug).collection("staff").doc(email).set({
      permissions,
      status: "invited",
      invitedAt: now,
      lastLoginAt: null,
    }, { merge: true });

    await sendStaffInviteEmail(email, store.name || slug, slug);

    return NextResponse.json({ success: true, email, permissions });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
