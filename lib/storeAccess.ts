import { NextRequest } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyOwnerToken } from "@/lib/ownerAuth";

// Shared auth check for store-scoped endpoints: accepts EITHER the store's
// x-api-key header (existing mobile/integration pattern) OR a valid owner
// session Bearer token belonging to this store's owner (new web dashboard
// pattern). Returns true if either check passes.
export async function verifyStoreAccess(req: NextRequest, slug: string): Promise<boolean> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const keySnap = await db.collection("storeKeys").doc(slug).get();
    if (keySnap.exists && keySnap.data()!.apiKey === apiKey) return true;
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const ownerPayload = verifyOwnerToken(token);
  if (ownerPayload) {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (storeSnap.exists && storeSnap.data()!.ownerWallet === ownerPayload.ownerId) return true;
  }

  return false;
}
