import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// DELETE /api/store/[slug]/expenses/[expenseId] — delete an expense (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; expenseId: string }> }
) {
  const { slug, expenseId } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.collection("stores").doc(slug).collection("expenses").doc(expenseId).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
