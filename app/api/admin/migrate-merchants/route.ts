import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_MIGRATE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snap = await db.collection("pay_merchants").get();
  let updated = 0;

  for (const doc of snap.docs) {
    if (doc.data().revoked === undefined) {
      await doc.ref.update({ revoked: false });
      updated++;
    }
  }

  return NextResponse.json({ success: true, totalDocs: snap.size, updated });
}
