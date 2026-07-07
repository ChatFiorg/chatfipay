import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyOwnerToken } from "@/lib/ownerAuth";

// GET /api/owner-auth/me — Authorization: Bearer <owner token>
// Re-checks the store-ownership lookup live (rather than trusting whatever
// was true at login time) so a newly created store shows up immediately.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyOwnerToken(token);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [kind, identifier] = payload.ownerId.split(/:(.+)/);
    const collection = kind === "wallet" ? "storeWallets" : "storeEmails";
    const snap = await db.collection(collection).doc(identifier).get();
    const hasStore = snap.exists && Array.isArray(snap.data()?.usernames) && snap.data()!.usernames.length > 0;
    const activeUsername = hasStore ? snap.data()!.activeUsername : null;
    const usernames = hasStore ? snap.data()!.usernames : [];

    return NextResponse.json({
      success: true,
      ownerId: payload.ownerId,
      method: payload.method,
      hasStore,
      activeUsername,
      usernames,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
