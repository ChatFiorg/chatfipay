import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { createTerminalAddress, createTerminalWebhook } from "@/lib/terminalAfrica";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const storeSnap = await db.collection("stores").doc(slug).get();
    const automated = storeSnap.exists ? (storeSnap.data()!.shipping?.automated || {}) : {};

    const keySnap = await db.collection("storeKeys").doc(slug).get();
    const hasApiKey = keySnap.exists && !!keySnap.data()!.terminalApiKey;

    return NextResponse.json({ success: true, automated, hasApiKey });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { enabled, defaultWeightKg, pickupAddress, apiKey } = body;

    const keyRef = db.collection("storeKeys").doc(slug);
    const keySnap = await keyRef.get();
    let terminalApiKey: string | undefined = keySnap.exists ? keySnap.data()!.terminalApiKey : undefined;

    if (apiKey) {
      terminalApiKey = apiKey;
      await keyRef.set({ terminalApiKey }, { merge: true });
    }

    if (!terminalApiKey) {
      return NextResponse.json({ error: "No Terminal Africa API key on file yet — please provide one" }, { status: 400 });
    }

    const storeRef = db.collection("stores").doc(slug);
    const storeSnap = await storeRef.get();
    const existingAutomated = storeSnap.exists ? (storeSnap.data()!.shipping?.automated || {}) : {};

    let pickupAddressId = existingAutomated.pickupAddressId || null;
    let webhookId = existingAutomated.webhookId || null;

    if (pickupAddress) {
      const created = await createTerminalAddress(terminalApiKey, {
        first_name: pickupAddress.firstName,
        last_name: pickupAddress.lastName,
        email: pickupAddress.email,
        phone: pickupAddress.phone,
        line1: pickupAddress.line1,
        city: pickupAddress.city,
        state: pickupAddress.state,
        country: pickupAddress.country || 'NG',
        zip: pickupAddress.zip || undefined,
      });
      pickupAddressId = created.address_id || created.id || pickupAddressId;
    }

    if (!webhookId) {
      try {
        const webhookUrl = `https://pay.chatfi.pro/api/store/${slug}/shipping/webhook`;
        const webhook = await createTerminalWebhook(terminalApiKey, webhookUrl);
        webhookId = webhook.webhook_id || webhook.id || null;
      } catch (e) {
        console.error("Terminal webhook registration failed:", e);
      }
    }

    const automated = {
      enabled: !!enabled,
      provider: 'terminal',
      defaultWeightKg: defaultWeightKg ? Number(defaultWeightKg) : (existingAutomated.defaultWeightKg ?? 1),
      pickupAddress: pickupAddress || existingAutomated.pickupAddress || null,
      pickupAddressId,
      webhookId,
    };

    await storeRef.set({ shipping: { automated } }, { merge: true });

    return NextResponse.json({ success: true, automated });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
