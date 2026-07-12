import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export const RESERVATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

type StockDeduction = { productId: string; quantity: number; variantKey?: string };

// Applies a location-scoped stock delta (positive to restore, negative to
// deduct) to a product that has locationStock configured. Recomputes the
// top-level `stock` field as the new sum across all locations so that
// stats, CSV export, and out-of-stock checks (which all read the flat
// `stock` field) keep working without any changes on their end.
export function applyLocationDelta(product: any, locationId: string, delta: number): Record<string, any> | null {
  const locationStock = product.locationStock;
  if (!locationStock || typeof locationStock !== "object" || !(locationId in locationStock)) return null;

  const current = locationStock[locationId];
  if (current == null) return null; // unlimited stock at this location, nothing to adjust

  const updatedLocationStock = { ...locationStock, [locationId]: Math.max(0, current + delta) };
  const newTotal: number = (Object.values(updatedLocationStock) as any[]).reduce((sum: number, v: any) => sum + (v != null ? Number(v) : 0), 0);

  const update: Record<string, any> = { locationStock: updatedLocationStock, stock: newTotal };
  if (newTotal === 0 && delta < 0) update.active = false;
  if (newTotal > 0 && delta > 0) update.active = true;
  return update;
}

// Deducts stock immediately for a newly-created order, used when the
// merchant has Reserve Inventory enabled. Mirrors the deduction logic that
// normally runs in webhook/route.ts on payment confirmation, but runs at
// order-creation time instead so the stock is held for the reservation
// window regardless of whether the buyer ever pays.
//
// locationId is optional: when a product has per-location stock configured
// and the order carries a resolved locationId, deduction happens against
// that location and the flat `stock` field is kept in sync as the sum.
// Otherwise this falls back to the original flat-stock behavior unchanged.
export async function reserveStockForOrder(slug: string, stockDeductions: StockDeduction[], locationId?: string | null): Promise<void> {
  for (const item of stockDeductions) {
    if (!item.productId) continue;
    const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) continue;
    const product = productSnap.data()!;

    if (item.variantKey && product.variantStock && product.variantStock[item.variantKey]) {
      const combo = product.variantStock[item.variantKey];
      const update: any = {};
      if (combo.stock != null) {
        const newComboStock = Math.max(0, combo.stock - item.quantity);
        update.variantStock = { ...product.variantStock, [item.variantKey]: { ...combo, stock: newComboStock } };
      }
      if (Object.keys(update).length) await productRef.update(update);
      continue;
    }

    if (locationId) {
      const locationUpdate = applyLocationDelta(product, locationId, -item.quantity);
      if (locationUpdate) {
        await productRef.update(locationUpdate);
        continue;
      }
    }

    if (product.stock == null) continue; // unlimited stock, nothing to reserve

    const newStock = Math.max(0, product.stock - item.quantity);
    const update: any = { stock: FieldValue.increment(-Math.min(item.quantity, product.stock)) };
    if (newStock === 0) update.active = false;
    await productRef.update(update);
  }
}

// Restores stock for a single order's deductions. Used both when releasing
// an expired reservation and (via the cancel-order route) when a paid order
// is cancelled after the fact. Same locationId fallback rules as above —
// pass the locationId that was resolved and stored on the order at
// checkout time so stock returns to the correct location.
export async function restoreStockForOrder(slug: string, stockDeductions: StockDeduction[], locationId?: string | null): Promise<void> {
  for (const item of stockDeductions) {
    if (!item.productId) continue;
    const productRef = db.collection("stores").doc(slug).collection("products").doc(item.productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) continue;
    const product = productSnap.data()!;

    if (item.variantKey && product.variantStock && product.variantStock[item.variantKey]) {
      const combo = product.variantStock[item.variantKey];
      const update: any = {};
      if (combo.stock != null) {
        const restoredStock = combo.stock + item.quantity;
        update.variantStock = { ...product.variantStock, [item.variantKey]: { ...combo, stock: restoredStock } };
      }
      if (Object.keys(update).length) await productRef.update(update);
      continue;
    }

    if (locationId) {
      const locationUpdate = applyLocationDelta(product, locationId, item.quantity);
      if (locationUpdate) {
        await productRef.update(locationUpdate);
        continue;
      }
    }

    if (product.stock == null) continue;

    await productRef.update({ stock: FieldValue.increment(item.quantity), active: true });
  }
}

// Finds pending orders in a store whose stock reservation has expired
// (buyer never paid within the reservation window) and releases the held
// stock back to the product, marking the order "expired" so it stops
// showing as pending. Non-fatal — called opportunistically at the start of
// each new checkout attempt, and again as a safety net from the daily
// abandoned-carts cron.
export async function releaseExpiredReservations(slug: string): Promise<void> {
  try {
    const now = Timestamp.now();
    const snap = await db.collection("stores").doc(slug).collection("orders")
      .where("status", "==", "pending")
      .where("stockReserved", "==", true)
      .where("reservationExpiresAt", "<=", now)
      .get();

    for (const doc of snap.docs) {
      const order = doc.data();
      const stockDeductions: StockDeduction[] = Array.isArray(order.stockDeductions) ? order.stockDeductions : [];
      try {
        await restoreStockForOrder(slug, stockDeductions, order.locationId || null);
        await doc.ref.set({ status: "expired", stockReserved: false }, { merge: true });
      } catch (e) {
        console.error(`Failed to release reservation for order ${doc.id}:`, e);
      }
    }
  } catch (e) {
    console.error(`releaseExpiredReservations(${slug}) failed:`, e);
  }
}
