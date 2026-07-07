import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";

// GET /api/store/[slug]/staff/products — Authorization: Bearer <staff token OR owner token>
// Requires permissions.products.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const auth = await resolveStaffOrOwner(token, slug);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.permissions.products) {
    return NextResponse.json({ error: "You don't have permission to view products" }, { status: 403 });
  }

  try {
    const snap = await db.collection("stores").doc(slug).collection("products")
      .orderBy("createdAt", "desc").get();
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, products });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/staff/products — Authorization: Bearer <staff token OR owner token>
// Requires permissions.products. body: { product: { id?, name, description, price, stock, image, active } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const auth = await resolveStaffOrOwner(token, slug);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.permissions.products) {
    return NextResponse.json({ error: "You don't have permission to manage products" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { product } = body;
    if (!product || !product.name || product.price == null) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const productId = product.id || db.collection("stores").doc(slug).collection("products").doc().id;
    await db.collection("stores").doc(slug).collection("products").doc(productId).set({
      ...product,
      id: productId,
      active: product.active ?? true,
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUpdatedByStaff: auth.actor,
    }, { merge: true });

    return NextResponse.json({ success: true, productId });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
