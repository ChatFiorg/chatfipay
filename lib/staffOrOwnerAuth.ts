import { resolveStaffToken, StaffPermissions } from "./staffAuth";
import { verifyOwnerToken } from "./ownerAuth";
import { db } from "./firebaseAdmin";

export interface ResolvedStoreAuth {
  permissions: StaffPermissions;
  actor: string; // staff email, or "owner:<ownerId>" for audit logging
  locationId: string | null; // null = unrestricted (owner, or staff with no location assigned)
}

const FULL_PERMISSIONS: StaffPermissions = { orders: true, products: true, analytics: true };

// Accepts EITHER a staff token (checked against live Firestore permissions)
// OR an owner token (granted full permissions if they own this store).
// Used by every staff-facing store endpoint so store owners aren't locked
// out of their own dashboard just because they have no staff doc.
export async function resolveStaffOrOwner(
  token: string | null,
  slug: string
): Promise<ResolvedStoreAuth | null> {
  const staffPayload = await resolveStaffToken(token, slug);
  if (staffPayload) {
    return { permissions: staffPayload.permissions, actor: staffPayload.email, locationId: staffPayload.locationId || null };
  }

  const ownerPayload = verifyOwnerToken(token);
  if (!ownerPayload) return null;

  const [kind, identifier] = ownerPayload.ownerId.split(/:(.+)/);
  const collection = kind === "wallet" ? "storeWallets" : "storeEmails";
  const snap = await db.collection(collection).doc(identifier).get();
  if (!snap.exists) return null;

  const usernames: string[] = snap.data()?.usernames || [];
  if (!usernames.includes(slug)) return null;

  return { permissions: FULL_PERMISSIONS, actor: `owner:${ownerPayload.ownerId}`, locationId: null };
}
