import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { getTerminalQuotes } from "@/lib/terminalAfrica";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { deliveryAddress, cartValue, cartWeightKg } = body;

    if (!deliveryAddress) {
      return NextResponse.json({ error: "Missing deliveryAddress" }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const automated = storeSnap.data()!.shipping?.automated;

    if (!automated?.enabled || !automated?.activeLocationId) {
      return NextResponse.json({ success: true, rates: [], fallback: true });
    }

    const keySnap = await db.collection("storeKeys").doc(slug).get();
    const terminalApiKey = keySnap.exists ? keySnap.data()!.terminalApiKey : null;
    if (!terminalApiKey) {
      return NextResponse.json({ success: true, rates: [], fallback: true });
    }

    const locationSnap = await db.collection("stores").doc(slug).collection("locations").doc(automated.activeLocationId).get();
    if (!locationSnap.exists) {
      return NextResponse.json({ success: true, rates: [], fallback: true });
    }
    const loc = locationSnap.data()!;

    const weightKg = cartWeightKg ? Number(cartWeightKg) : (automated.defaultWeightKg || 1);

    const quotes = await getTerminalQuotes(terminalApiKey, {
      pickupAddress: {
        first_name: loc.firstName || "",
        last_name: loc.lastName || "",
        email: loc.email || "",
        phone: loc.phone || "",
        line1: loc.address || "",
        line2: loc.line2 || undefined,
        city: loc.city || "",
        state: loc.state || "",
        country: "NG",
        zip: loc.zip || undefined,
      },
      deliveryAddress: {
        first_name: deliveryAddress.firstName,
        last_name: deliveryAddress.lastName,
        email: deliveryAddress.email || 'buyer@chatfi.pro',
        phone: deliveryAddress.phone,
        line1: deliveryAddress.line1,
        line2: deliveryAddress.line2 || undefined,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        country: deliveryAddress.country || 'NG',
        zip: deliveryAddress.zip || undefined,
      },
      weightKg,
      value: cartValue ? Number(cartValue) : 0,
      description: `Order from ${slug}`,
    });

    const rates = (Array.isArray(quotes) ? quotes : []).map((r: any) => ({
      rateId: r.id || r.rate_id,
      carrierName: r.carrier_name,
      carrierLogo: r.carrier_logo,
      amount: r.amount,
      currency: r.currency || 'NGN',
      deliveryTime: r.delivery_time,
      pickupTime: r.pickup_time,
    }));

    // Cache each quoted rate's real amount server-side, keyed by rateId, so
    // the charge routes can look up the authoritative price at checkout
    // time instead of trusting a client-supplied amount (which a buyer
    // could tamper with to pay less than the real courier cost).
    const now = Timestamp.now();
    await Promise.all(
      rates
        .filter(r => r.rateId)
        .map(r =>
          db.collection("stores").doc(slug).collection("rateQuotes").doc(r.rateId).set({
            amount: r.amount,
            carrierName: r.carrierName,
            createdAt: now,
          }).catch(e => console.error("Failed to cache rate quote:", e))
        )
    );

    return NextResponse.json({ success: true, rates, fallback: false });
  } catch (e: any) {
    console.error("Terminal rates error:", e);
    return NextResponse.json({ success: true, rates: [], fallback: true, error: e.message });
  }
}
