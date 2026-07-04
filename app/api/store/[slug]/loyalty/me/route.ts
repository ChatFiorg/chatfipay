import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyBuyerToken } from "@/lib/buyerAuth";
import { getLoyaltyBalance } from "@/lib/loyalty";

// GET /api/store/[slug]/loyalty/me — Authorization: Bearer <buyer token>
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyBuyerToken(token);

  if (!payload || payload.slug !== slug) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    const loyalty = storeSnap.exists ? storeSnap.data()!.loyalty : null;
    const points = await getLoyaltyBalance(slug, payload.email);

    return NextResponse.json({
      success: true,
      points,
      enabled: !!loyalty?.enabled,
      redeemValue: loyalty?.redeemValue || 1,
      earnRate: loyalty?.earnRate || 0,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
