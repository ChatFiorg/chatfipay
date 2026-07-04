import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import PDFDocument from "pdfkit";

async function getStoreByApiKey(apiKey: string | null, slug: string) {
  if (!apiKey) return null;
  const snap = await db.collection("storeKeys").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.apiKey !== apiKey) return null;
  return data;
}

function formatNgn(n: number | undefined | null): string {
  return `NGN ${Number(n || 0).toLocaleString()}`;
}

function generateInvoicePdf(store: any, order: any, orderId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text(store.name || store.username, 50, 50);
    doc.fontSize(10).font("Helvetica").fillColor("#666")
      .text(`${store.username}.chatfi.pro`, 50, 75);

    doc.fontSize(16).font("Helvetica-Bold").fillColor("#000")
      .text("INVOICE", 400, 50, { align: "right" });
    doc.fontSize(9).font("Helvetica").fillColor("#666")
      .text(`Order ID: ${orderId}`, 400, 72, { align: "right" })
      .text(`Date: ${order.createdAt?.toDate?.()?.toLocaleDateString?.("en-NG") || ""}`, 400, 85, { align: "right" })
      .text(`Status: ${(order.status || "").toUpperCase()}`, 400, 98, { align: "right" });

    doc.moveTo(50, 120).lineTo(545, 120).strokeColor("#ddd").stroke();

    // Bill to
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#000").text("Bill To", 50, 135);
    doc.fontSize(10).font("Helvetica").fillColor("#333")
      .text(order.buyerName || "N/A", 50, 152)
      .text(order.buyerPhone || "", 50, 166)
      .text(order.buyerEmail || "", 50, 180)
      .text(order.buyerDelivery || order.buyerAddress || "", 50, 194, { width: 300 });

    // Line item table
    let y = 240;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");
    doc.text("Item", 50, y);
    doc.text("Qty", 350, y, { width: 50, align: "right" });
    doc.text("Unit Price", 400, y, { width: 70, align: "right" });
    doc.text("Total", 475, y, { width: 70, align: "right" });
    y += 15;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#ddd").stroke();
    y += 10;

    doc.font("Helvetica").fillColor("#333");
    const qty = order.quantity || 1;
    const unitPrice = order.unitPrice ?? order.amount;
    doc.text(order.productName || "Product", 50, y, { width: 280 });
    doc.text(String(qty), 350, y, { width: 50, align: "right" });
    doc.text(formatNgn(unitPrice), 400, y, { width: 70, align: "right" });
    doc.text(formatNgn(unitPrice * qty), 475, y, { width: 70, align: "right" });
    y += 20;

    if (Array.isArray(order.addOns) && order.addOns.length > 0) {
      for (const addOn of order.addOns) {
        doc.fontSize(9).fillColor("#666").text(`+ ${addOn.name}`, 60, y, { width: 270 });
        doc.text(formatNgn(addOn.price), 400, y, { width: 70, align: "right" });
        doc.text(formatNgn(addOn.price * qty), 475, y, { width: 70, align: "right" });
        y += 15;
      }
    }

    y += 10;
    doc.moveTo(300, y).lineTo(545, y).strokeColor("#ddd").stroke();
    y += 12;

    const summaryRow = (label: string, value: string, bold = false) => {
      doc.fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#000" : "#666");
      doc.text(label, 350, y, { width: 120, align: "right" });
      doc.text(value, 475, y, { width: 70, align: "right" });
      y += 16;
    };

    summaryRow("Subtotal", formatNgn(order.subtotal));
    if (order.discountAmount) summaryRow(`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`, `-${formatNgn(order.discountAmount)}`);
    if (order.loyaltyDiscount) summaryRow("Loyalty points redeemed", `-${formatNgn(order.loyaltyDiscount)}`);
    if (order.giftCardAmountUsed) summaryRow(`Gift card${order.giftCardCode ? ` (${order.giftCardCode})` : ""}`, `-${formatNgn(order.giftCardAmountUsed)}`);
    if (order.shippingFee) summaryRow(order.deliveryMethod === "pickup" ? "Pickup" : "Shipping", formatNgn(order.shippingFee));
    y += 4;
    doc.moveTo(350, y).lineTo(545, y).strokeColor("#000").stroke();
    y += 10;
    summaryRow("Total Paid", formatNgn(order.amount), true);

    doc.fontSize(8).fillColor("#999").text("Powered by ChatFi", 50, 760, { align: "center", width: 495 });

    doc.end();
  });
}

// GET /api/store/[slug]/orders/[orderId]/invoice — owner only (x-api-key)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  const { slug, orderId } = await params;
  const apiKey = req.headers.get("x-api-key");
  const storeKey = await getStoreByApiKey(apiKey, slug);
  if (!storeKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;

    const orderSnap = await db.collection("stores").doc(slug).collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const order = orderSnap.data()!;

    const pdfBuffer = await generateInvoicePdf(store, order, orderId);

    return new NextResponse(pdfBuffer, {
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
