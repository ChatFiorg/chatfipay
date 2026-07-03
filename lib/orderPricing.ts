import { db } from "./firebaseAdmin";

export interface StockDeduction {
  productId: string;
  quantity: number;
}

export interface SelectedAddOn {
  id: string;
  name: string;
  price: number;
}

export interface OrderPricingResult {
  unitPrice: number;
  addOnsSelected: SelectedAddOn[];
  stockDeductions: StockDeduction[];
}

// Resolves the true per-unit price (base price + selected add-ons) and the
// list of {productId, quantity} deductions to apply on payment confirmation.
// For a 'bundle' product, stock lives on the *child* products, not the
// bundle itself, so this checks each child's availability and returns one
// deduction entry per child. For a normal product, it's a single entry.
export async function resolveOrderPricing(
  slug: string,
  product: any,
  quantity: number,
  selectedAddOnIds: string[] | undefined
): Promise<OrderPricingResult | { error: string }> {
  const availableAddOns: any[] = Array.isArray(product.addOns) ? product.addOns : [];
  const requestedIds = Array.isArray(selectedAddOnIds) ? selectedAddOnIds : [];
  const addOnsSelected: SelectedAddOn[] = availableAddOns
    .filter(a => requestedIds.includes(a.id))
    .map(a => ({ id: a.id, name: a.name, price: Number(a.price) || 0 }));

  const addOnsUnitPrice = addOnsSelected.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = Number(product.price) + addOnsUnitPrice;

  const stockDeductions: StockDeduction[] = [];

  if (product.type === "bundle" && Array.isArray(product.bundleItems) && product.bundleItems.length > 0) {
    for (const item of product.bundleItems) {
      const childSnap = await db.collection("stores").doc(slug).collection("products").doc(item.productId).get();
      if (!childSnap.exists) {
        return { error: "One of the items in this bundle is no longer available" };
      }
      const child = childSnap.data()!;
      if (!child.active) {
        return { error: `"${child.name}" in this bundle is currently unavailable` };
      }
      const needed = (item.quantity || 1) * quantity;
      if (child.stock != null && child.stock < needed) {
        return { error: `Not enough stock for "${child.name}" in this bundle` };
      }
      stockDeductions.push({ productId: item.productId, quantity: needed });
    }
  } else {
    stockDeductions.push({ productId: product.id, quantity });
  }

  return { unitPrice, addOnsSelected, stockDeductions };
}
