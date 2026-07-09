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
    const { enabled, defaultWeightKg, savedAddresses, activeAddressId, apiKey } = body;

    if (savedAddresses && savedAddresses.length > 5) {
      return NextResponse.json({ error: "Maximum of 5 saved addresses allowed" }, { status: 400 });
    }

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

    // savedAddresses: client owns the array (up to 5, each with a label like
    // "Headquarters" or "Branch 2"). Only the active one needs a Terminal
    // Africa address_id — created lazily on first save, reused afterward so
    // we don't create duplicate addresses on Terminal's side every save.
    const addresses = Array.isArray(savedAddresses) ? savedAddresses : (existingAutomated.savedAddresses || []);
    const existingById: Record<string, any> = {};
    for (const a of (existingAutomated.savedAddresses || [])) existingById[a.id] = a;

    let resolvedActiveId = activeAddressId || existingAutomated.activeAddressId || (addresses[0]?.id ?? null);
    let pickupAddress: any = null;
    let pickupAddressId: string | null = existingAutomated.pickupAddressId || null;
    let terminalAddressWarning: string | null = null;

    for (const addr of addresses) {
      const prior = existingById[addr.id];
      if (addr.id === resolvedActiveId) {
        let terminalAddressId = prior?.terminalAddressId || addr.terminalAddressId || null;
        if (!terminalAddressId) {
          // Creating the Terminal Africa address is best-effort: if it fails
          // (e.g. KYC not yet approved), we still save the address book to
          // Firestore so the merchant doesn't lose their input. Live rates
          // simply won't work until this succeeds on a later save.
          try {
            const created = await createTerminalAddress(terminalApiKey, {
              first_name: addr.firstName,
              last_name: addr.lastName,
              email: addr.email,
              phone: addr.phone,
              line1: addr.line1,
              city: addr.city,
              state: addr.state,
              country: addr.country || 'NG',
              zip: addr.zip || undefined,
            });
            terminalAddressId = created.address_id || created.id || null;
          } catch (e: any) {
            console.error("Terminal address creation failed:", e);
            terminalAddressWarning = e.message || "Could not register this address with Terminal Africa yet";
          }
        }
        addr.terminalAddressId = terminalAddressId;
        pickupAddress = { ...addr };
        pickupAddressId = terminalAddressId;
      } else if (prior?.terminalAddressId) {
        addr.terminalAddressId = prior.terminalAddressId;
      }
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
      savedAddresses: addresses,
      activeAddressId: resolvedActiveId,
      pickupAddress: pickupAddress || existingAutomated.pickupAddress || null,
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
