import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";
import PDFDocument from "pdfkit";

function formatNgn(n: number | undefined | null): string {
  return `\u20a6${Number(n || 0).toLocaleString()}`;
}

function generateInvoicePdf(store: any, order: any, orderId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const date = order.createdAt?.toDate?.()?.toLocaleDateString?.("en-NG") || new Date().toLocaleDateString("en-NG");
    const qty = order.quantity || 1;
    const unitPrice = order.unitPrice ?? order.amount;
    const total = unitPrice * qty;

    const invoiceItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [{ productName: order.productName || "Product", quantity: qty, unitPrice, addOns: order.addOns, selectedVariant: order.selectedVariant }];

    // ── Header ──
    doc.fontSize(18).fillColor("#111111").font("Helvetica-Bold").text(store.name || store.username, 50, 50);
    doc.fontSize(9).fillColor("#999999").font("Helvetica").text(`${store.username}.chatfi.pro`, 50, 72);

    doc.fontSize(20).fillColor("#111111").font("Helvetica-Bold").text("Invoice", 0, 50, { align: "right" });
    doc.fontSize(9).fillColor("#666666").font("Helvetica")
      .text(`#${orderId.slice(0, 12)}`, { align: "right" })
      .text(date, { align: "right" })
      .text((order.status || "pending").toUpperCase(), { align: "right" });

    doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#eeeeee").lineWidth(1).stroke();

    // ── Bill To ──
    let y = 130;
    doc.fontSize(9).fillColor("#999999").font("Helvetica-Bold").text("BILL TO", 50, y);
    y += 16;
    doc.fontSize(11).fillColor("#333333").font("Helvetica");
    doc.text(order.buyerName || "N/A", 50, y); y += 15;
    if (order.buyerPhone) { doc.text(order.buyerPhone, 50, y); y += 15; }
    if (order.buyerEmail) { doc.text(order.buyerEmail, 50, y); y += 15; }
    if (order.buyerDelivery || order.buyerAddress) { doc.text(order.buyerDelivery || order.buyerAddress, 50, y, { width: 300 }); y += 15; }

    // ── Items table ──
    y += 20;
    const colItem = 50, colQty = 330, colPrice = 390, colTotal = 470;
    doc.fontSize(9).fillColor("#999999").font("Helvetica-Bold");
    doc.text("ITEM", colItem, y);
    doc.text("QTY", colQty, y);
    doc.text("UNIT PRICE", colPrice, y);
    doc.text("TOTAL", colTotal, y, { width: 75, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#eeeeee").lineWidth(1).stroke();
    y += 10;

    doc.font("Helvetica").fontSize(10).fillColor("#333333");
    for (const item of invoiceItems) {
      const itemQty = item.quantity ?? 1;
      const itemUnitPrice = item.unitPrice ?? 0;
      const itemTotal = itemUnitPrice * itemQty;
      const nameLabel = item.selectedVariant ? `${item.productName || "Product"} (${item.selectedVariant})` : (item.productName || "Product");

      doc.text(nameLabel, colItem, y, { width: 270 });
      doc.text(String(itemQty), colQty, y);
      doc.text(formatNgn(itemUnitPrice), colPrice, y);
      doc.text(formatNgn(itemTotal), colTotal, y, { width: 75, align: "right" });
      y += 20;

      if (Array.isArray(item.addOns)) {
        for (const a of item.addOns) {
          doc.fontSize(9).fillColor("#666666");
          doc.text(`+ ${a.name}`, colItem, y, { width: 270 });
          doc.text(String(itemQty), colQty, y);
          doc.text(formatNgn(a.price), colPrice, y);
          doc.text(formatNgn(a.price * itemQty), colTotal, y, { width: 75, align: "right" });
          y += 18;
          doc.fontSize(10).fillColor("#333333");
        }
      }
    }

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#eeeeee").lineWidth(1).stroke();
    y += 15;

    // ── Totals ──
    const totalsX = 380;
    doc.fontSize(10).fillColor("#666666").font("Helvetica");
    doc.text("Subtotal", totalsX, y, { width: 90 });
    doc.text(formatNgn(order.subtotal || total), totalsX + 90, y, { width: 75, align: "right" });
    y += 16;

    if (order.shippingFee) {
      doc.text(order.deliveryMethod === "pickup" ? "Pickup" : "Shipping", totalsX, y, { width: 90 });
      doc.text(formatNgn(order.shippingFee), totalsX + 90, y, { width: 75, align: "right" });
      y += 16;
    }
    if (order.discountAmount) {
      const label = order.discountCode ? `Discount (${order.discountCode})` : "Discount";
      doc.text(label, totalsX, y, { width: 90 });
      doc.text(`-${formatNgn(order.discountAmount)}`, totalsX + 90, y, { width: 75, align: "right" });
      y += 16;
    }
    if (order.loyaltyDiscount) {
      doc.text("Loyalty points", totalsX, y, { width: 90 });
      doc.text(`-${formatNgn(order.loyaltyDiscount)}`, totalsX + 90, y, { width: 75, align: "right" });
      y += 16;
    }

    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#111111").lineWidth(1.5).stroke();
    y += 8;
    doc.fontSize(13).fillColor("#111111").font("Helvetica-Bold");
    doc.text("Total Paid", totalsX, y, { width: 90 });
    doc.text(formatNgn(order.amount), totalsX + 90, y, { width: 75, align: "right" });

    // ── Footer ──
    doc.fontSize(9).fillColor("#bbbbbb").font("Helvetica")
      .text("Powered by ChatFi \u00b7 chatfi.pro", 50, 780, { align: "center", width: 495 });

    doc.end();
  });
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

    const pdfBuffer = await generateInvoicePdf(store, order, orderId);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${orderId}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
