import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const SECRET = "chatfi_diag_5m2x91q";

// GET /api/admin/diag-apikey?secret=...&slug=samstore
// One-off: read the real API key straight from Firestore. DELETE after use.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const slug = searchParams.get("slug") || "samstore";

  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ apiKey: snap.data()!.apiKey });
}
