import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// DELETE /api/store/[slug]/staff/[email] — revoke a staff member (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; email: string }> }
) {
  const { slug, email } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedEmail = decodeURIComponent(email);
    await db.collection("stores").doc(slug).collection("staff").doc(decodedEmail).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
