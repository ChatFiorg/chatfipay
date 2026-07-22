import { NextRequest, NextResponse } from "next/server";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { getWalletBalance } from "@/lib/wallet";

// GET /api/store/[slug]/wallet — current ChatFi credit balance for SMS/email sends.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const balance = await getWalletBalance(slug);
    return NextResponse.json({ balance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
