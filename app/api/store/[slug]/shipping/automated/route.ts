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

    const locationsSnap = await db.collection("stores").doc(slug).collection("locations").orderBy("createdAt", "asc").get();
    const locations = locationsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        address: data.address || null,
        active: data.active !== false,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        terminalAddressId: data.terminalAddressId || null,
      };
    });

    return NextResponse.json({ success: true, automated, hasApiKey, locations });
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
    const { enabled, defaultWeightKg, activeLocationId, apiKey } = body;

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

    let webhookId = existingAutomated.webhookId || null;

    const resolvedActiveLocationId: string | null = activeLocationId || existingAutomated.activeLocationId || null;
    let pickupAddressId: string | null = existingAutomated.pickupAddressId || null;
    let terminalAddressWarning: string | null = null;

    if (resolvedActiveLocationId) {
      const locationRef = storeRef.collection("locations").doc(resolvedActiveLocationId);
      const locationSnap = await locationRef.get();

      if (!locationSnap.exists) {
        return NextResponse.json({ error: "Selected location not found" }, { status: 400 });
      }

      const loc = locationSnap.data()!;
      let terminalAddressId: string | null = loc.terminalAddressId || null;

      if (!terminalAddressId) {
        try {
          const created = await createTerminalAddress(terminalApiKey, {
            first_name: loc.firstName || "",
            last_name: loc.lastName || "",
            email: loc.email || "",
            phone: loc.phone || "",
            line1: loc.address || "",
            city: loc.city || "",
            state: loc.state || "",
            country: "NG",
            zip: loc.zip || undefined,
          });
          terminalAddressId = created.address_id || created.id || null;
          if (terminalAddressId) {
            await locationRef.set({ terminalAddressId }, { merge: true });
          }
        } catch (e: any) {
          console.error("Terminal address creation failed:", e);
          terminalAddressWarning = e.message || "Could not register this location with Terminal Africa yet — check its courier details are complete";
        }
      }

      pickupAddressId = terminalAddressId;
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
      activeLocationId: resolvedActiveLocationId,
      pickupAddressId,
      webhookId,
    };

    await storeRef.set({ shipping: { automated } }, { merge: true });

    return NextResponse.json({ success: true, automated, warning: terminalAddressWarning || undefined });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
