import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { resolveStaffOrOwner } from "@/lib/staffOrOwnerAuth";

// DELETE /api/store/[slug]/staff/products/[productId] — Authorization: Bearer <staff token OR owner token>
// Requires permissions.products.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; productId: string }> }
) {
  const { slug, productId } = await params;
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
    await db.collection("stores").doc(slug).collection("products").doc(productId).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
