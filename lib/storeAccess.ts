import { NextRequest } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyOwnerToken } from "@/lib/ownerAuth";

// Shared auth check for store-scoped endpoints: accepts EITHER the store's
// x-api-key header (existing mobile/integration pattern) OR a valid owner
// session Bearer token belonging to this store's owner (new web dashboard
// pattern). Returns true if either check passes.
//
// Ownership is resolved via the owner's own storeWallets/storeEmails doc
// (checking their usernames array) rather than comparing the store doc's
// ownerWallet field directly — stores created before the owner-token system
// existed may have an unprefixed wallet address in that field, which would
// never match a prefixed "wallet:<address>" token ID. This mirrors the same
// lookup resolveStaffOrOwner already uses for products/orders.
export async function verifyStoreAccess(req: NextRequest, slug: string): Promise<boolean> {
  // Accept the API key via header (used by fetch()-based calls) or a "key"
  // query param (used when a URL is opened directly, e.g. mobile's in-app
  // browser navigating straight to a download link, which can't set headers).
  const apiKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key");
  if (apiKey) {
    const keySnap = await db.collection("storeKeys").doc(slug).get();
    if (keySnap.exists && keySnap.data()!.apiKey === apiKey) return true;
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const ownerPayload = verifyOwnerToken(token);
  if (ownerPayload) {
    const [kind, identifier] = ownerPayload.ownerId.split(/:(.+)/);
    const collection = kind === "wallet" ? "storeWallets" : "storeEmails";
    const ownerSnap = await db.collection(collection).doc(identifier).get();
    if (ownerSnap.exists) {
      const usernames: string[] = ownerSnap.data()?.usernames || [];
      if (usernames.includes(slug)) return true;
    }
  }

  return false;
}
