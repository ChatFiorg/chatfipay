import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// TEMP diagnostic route — DELETE after use.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== "chatfi_sweepall_7k2m91q") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snap = await db.collection("pay_links").limit(1000).get();
  let missing = 0;
  let total = 0;
  const missingIds: string[] = [];

  snap.forEach(doc => {
    total++;
    const d = doc.data();
    if (!d.merchantWallet) {
      missing++;
      missingIds.push(doc.id);
    }
  });

  return NextResponse.json({ total, missing, missingIds: missingIds.slice(0, 20) });
}
