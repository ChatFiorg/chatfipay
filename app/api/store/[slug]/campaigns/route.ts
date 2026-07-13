import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/campaigns — campaign history (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("campaigns")
      .orderBy("sentAt", "desc").limit(50).get();

    const campaigns = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        type: data.type,
        message: data.message,
        segment: data.segment,
        tag: data.tag || null,
        recipientCount: data.recipientCount || 0,
        status: data.status,
        error: data.error || null,
        sentAt: data.sentAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, campaigns });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
