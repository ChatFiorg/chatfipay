import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

const MIGRATE_SECRET = "chatfi_migrateloc_9x4p22r";

// One-off migration: copies each store's shipping.automated.savedAddresses
// into that store's locations subcollection, preserving terminalAddressId
// so Terminal Africa addresses aren't re-created. Safe to run more than
// once — skips stores already marked migrated, and skips individual
// addresses that already have a matching location (by terminalAddressId
// or label) so re-runs don't create duplicates.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== MIGRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: any[] = [];

  try {
    const storesSnap = await db.collection("stores").get();

    for (const storeDoc of storesSnap.docs) {
      const slug = storeDoc.id;
      const data = storeDoc.data();

      if (data.locationsMigrated) {
        results.push({ slug, skipped: "already migrated" });
        continue;
      }

      const savedAddresses = data.shipping?.automated?.savedAddresses;
      if (!Array.isArray(savedAddresses) || savedAddresses.length === 0) {
        await storeDoc.ref.set({ locationsMigrated: true }, { merge: true });
        results.push({ slug, migrated: 0 });
        continue;
      }

      const locationsRef = storeDoc.ref.collection("locations");
      const existingSnap = await locationsRef.get();
      const existingByTerminalId = new Set(existingSnap.docs.map(d => d.data().terminalAddressId).filter(Boolean));
      const existingByLabel = new Set(existingSnap.docs.map(d => d.data().name));

      let migratedCount = 0;
      for (const addr of savedAddresses) {
        if (addr.terminalAddressId && existingByTerminalId.has(addr.terminalAddressId)) continue;
        if (!addr.terminalAddressId && existingByLabel.has(addr.label)) continue;

        await locationsRef.add({
          name: addr.label || "Pickup location",
          address: [addr.line1, addr.city, addr.state].filter(Boolean).join(", ") || null,
          active: true,
          createdAt: Timestamp.now(),
          firstName: addr.firstName || null,
          lastName: addr.lastName || null,
          email: addr.email || null,
          phone: addr.phone || null,
          city: addr.city || null,
          state: addr.state || null,
          zip: addr.zip || null,
          terminalAddressId: addr.terminalAddressId || null,
        });
        migratedCount++;
      }

      await storeDoc.ref.set({ locationsMigrated: true }, { merge: true });
      results.push({ slug, migrated: migratedCount });
    }

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
