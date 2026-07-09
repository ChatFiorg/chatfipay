import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyTerminalWebhookSignature } from "@/lib/terminalAfrica";

// POST /api/store/[slug]/shipping/webhook — called by Terminal Africa on
// shipment status changes (shipment.created, shipment.updated,
// shipment.delivered, shipment.cancelled). Registered via createTerminalWebhook()
// in shipping/automated/route.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Verify signature if a webhook secret is on file for this store.
    // Non-fatal if missing: automated/route.ts doesn't currently capture
    // a signing secret from Terminal's create-webhook response, so most
    // stores won't have one yet. Once that's wired up, this becomes a hard
    // requirement (return 401 on mismatch) rather than a soft check.
    const keySnap = await db.collection("storeKeys").doc(slug).get();
    const webhookSecret = keySnap.exists ? keySnap.data()!.terminalWebhookSecret : null;
    if (webhookSecret) {
      const signature = req.headers.get("x-terminal-signature");
      const valid = verifyTerminalWebhookSignature(signature, webhookSecret, rawBody);
      if (!valid) {
        console.error(`Terminal webhook signature mismatch for store ${slug}`);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = body.event || body.type;
    const data = body.data || body;

    // Terminal's payload nests the shipment under different keys depending
    // on event type in some providers' APIs; support both shapes defensively.
    const shipmentId = data.shipment_id || data.id || data.shipment?.id;
    const status = data.status || data.shipment_status || data.shipment?.status;
    const trackingCode = data.tracking_code || data.trackingCode || data.shipment?.tracking_code;
    const trackingUrl = data.tracking_url || data.shipment?.tracking_url;

    if (!shipmentId) {
      console.error(`Terminal webhook missing shipment id for store ${slug}`, body);
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }

    // Find the order this shipment belongs to. Orders store shipmentId
    // when arrangeTerminalPickup() succeeds in the payment webhook.
    const ordersRef = db.collection("stores").doc(slug).collection("orders");
    const matchSnap = await ordersRef.where("shipmentId", "==", shipmentId).limit(1).get();

    if (matchSnap.empty) {
      console.error(`No order found for Terminal shipment ${shipmentId} (store ${slug})`);
      return NextResponse.json({ success: true, matched: false });
    }

    const orderRef = matchSnap.docs[0].ref;
    const now = Timestamp.now();

    // Map Terminal's status vocabulary to the values the merchant dashboard
    // and OrderHistoryScreen already expect. Falls back to passing through
    // the raw status string for any event type not explicitly mapped.
    let shippingStatus: string;
    switch (event) {
      case "shipment.created":
        shippingStatus = "booked";
        break;
      case "shipment.delivered":
        shippingStatus = "delivered";
        break;
      case "shipment.cancelled":
        shippingStatus = "cancelled";
        break;
      case "shipment.updated":
      default:
        shippingStatus = status || "updated";
    }

    const update: Record<string, any> = {
      shippingStatus,
      shippingStatusUpdatedAt: now,
    };
    if (trackingCode) update.trackingCode = trackingCode;
    if (trackingUrl) update.trackingUrl = trackingUrl;
    if (shippingStatus === "delivered") update.deliveredAt = now;

    await orderRef.update(update);

    return NextResponse.json({ success: true, matched: true, orderId: orderRef.id, shippingStatus });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
