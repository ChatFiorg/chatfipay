import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

function formatNgn(n: number | undefined | null): string {
  return `₦${Number(n || 0).toLocaleString()}`;
}

function generateInvoiceHtml(store: any, order: any, orderId: string): string {
  const date = order.createdAt?.toDate?.()?.toLocaleDateString?.("en-NG") || new Date().toLocaleDateString("en-NG");
  const qty = order.quantity || 1;
  const unitPrice = order.unitPrice ?? order.amount;
  const total = unitPrice * qty;

  const invoiceItems = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{ productName: order.productName || 'Product', quantity: qty, unitPrice, addOns: order.addOns, selectedVariant: order.selectedVariant }];

  const itemRowsHtml = invoiceItems.map((item: any) => {
    const itemQty = item.quantity ?? 1;
    const itemUnitPrice = item.unitPrice ?? 0;
    const itemTotal = itemUnitPrice * itemQty;
    const nameLabel = item.selectedVariant ? `${item.productName || 'Product'} (${item.selectedVariant})` : (item.productName || 'Product');
    const addOnRows = Array.isArray(item.addOns) ? item.addOns.map((a: any) => `
        <tr>
          <td style="font-size:12px;color:#666">+ ${a.name}</td>
          <td>${itemQty}</td>
          <td>${formatNgn(a.price)}</td>
          <td>${formatNgn(a.price * itemQty)}</td>
        </tr>`).join('') : '';
    return `
        <tr>
          <td>${nameLabel}</td>
          <td>${itemQty}</td>
          <td>${formatNgn(itemUnitPrice)}</td>
          <td>${formatNgn(itemTotal)}</td>
        </tr>${addOnRows}`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Invoice - ${orderId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
  .page { background: #fff; max-width: 600px; margin: 0 auto; padding: 40px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #f0f0f0; }
  .store-name { font-size: 22px; font-weight: 800; color: #111; }
  .store-url { font-size: 12px; color: #999; margin-top: 4px; }
  .invoice-label { font-size: 28px; font-weight: 800; color: #111; text-align: right; }
  .invoice-meta { font-size: 12px; color: #666; text-align: right; margin-top: 4px; line-height: 1.6; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .bill-info { font-size: 13px; color: #333; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { font-size: 11px; color: #999; font-weight: 600; text-transform: uppercase; padding: 8px 0; border-bottom: 1px solid #eee; text-align: left; }
  th:last-child, td:last-child { text-align: right; }
  td { font-size: 13px; color: #333; padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
  .totals { margin-left: auto; width: 240px; }
  .total-row { display: flex; justify-content: space-between; font-size: 13px; color: #666; padding: 4px 0; }
  .total-row.final { font-size: 15px; font-weight: 800; color: #111; border-top: 2px solid #111; margin-top: 8px; padding-top: 8px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: ${order.status === 'paid' ? '#e8f5e9' : '#fff3e0'}; color: ${order.status === 'paid' ? '#2e7d32' : '#e65100'}; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f0; text-align: center; font-size: 11px; color: #bbb; }
  @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="store-name">${store.name || store.username}</div>
      <div class="store-url">${store.username}.chatfi.pro</div>
    </div>
    <div>
      <div class="invoice-label">Invoice</div>
      <div class="invoice-meta">
        #${orderId.slice(0, 12)}<br>
        ${date}<br>
        <span class="status-badge">${order.status || 'pending'}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Bill To</div>
    <div class="bill-info">
      ${order.buyerName || 'N/A'}<br>
      ${order.buyerPhone ? order.buyerPhone + '<br>' : ''}
      ${order.buyerEmail ? order.buyerEmail + '<br>' : ''}
      ${order.buyerDelivery || order.buyerAddress || ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
        ${itemRowsHtml}
      </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${formatNgn(order.subtotal || total)}</span></div>
    ${order.shippingFee ? `<div class="total-row"><span>${order.deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping'}</span><span>${formatNgn(order.shippingFee)}</span></div>` : ''}
    ${order.discountAmount ? `<div class="total-row"><span>Discount${order.discountCode ? ` (${order.discountCode})` : ''}</span><span>-${formatNgn(order.discountAmount)}</span></div>` : ''}
    ${order.loyaltyDiscount ? `<div class="total-row"><span>Loyalty points</span><span>-${formatNgn(order.loyaltyDiscount)}</span></div>` : ''}
    <div class="total-row final"><span>Total Paid</span><span>${formatNgn(order.amount)}</span></div>
  </div>

  <div class="footer">Powered by ChatFi · chatfi.pro</div>
</div>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;

    const orderSnap = await db.collection("stores").doc(slug).collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    const html = generateInvoiceHtml(store, order, orderId);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="invoice-${orderId}.html"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
