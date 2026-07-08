import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyOwnerToken } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

function generateApiKey(username: string) {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `sk_store_${username}_${rand}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const wallet = searchParams.get("wallet");

  if (!username && !wallet) return NextResponse.json({ error: "Missing username or wallet" }, { status: 400 });

  try {
    if (username) {
      const snap = await db.collection("stores").doc(username).get();
      if (!snap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

      const data = snap.data()!;
      const productsSnap = await db.collection("stores").doc(username).collection("products").get();
      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ ...data, products, template: data.template || 'dark' });
    }

    if (wallet) {
      const walletSnap = await db.collection("storeWallets").doc(wallet).get();
      if (!walletSnap.exists) return NextResponse.json({ error: "No store for this wallet" }, { status: 404 });
      const { usernames = [], activeUsername } = walletSnap.data()!;

      if (!usernames.length) return NextResponse.json({ error: "No store for this wallet" }, { status: 404 });

      const stores = await Promise.all(
        usernames.map(async (slug: string) => {
          const snap = await db.collection("stores").doc(slug).get();
          if (!snap.exists) return null;
          const keySnap = await db.collection("storeKeys").doc(slug).get();
          const keyData = keySnap.exists ? keySnap.data()! : {};
          return { ...snap.data(), apiKeyPrefix: keyData.apiKeyPrefix || "" };
        })
      );

      return NextResponse.json({
        stores: stores.filter(Boolean),
        activeUsername: activeUsername || usernames[0],
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const ownerPayload = verifyOwnerToken(token);

    let ownerCollection: string;
    let ownerIdentifier: string;
    let ownerWallet: string;

    if (ownerPayload) {
      // Web flow: authenticated via signed owner session token (wallet, Google, or email).
      const [ownerKind, identifier] = ownerPayload.ownerId.split(/:(.+)/);
      ownerCollection = ownerKind === "wallet" ? "storeWallets" : "storeEmails";
      ownerIdentifier = identifier;
      ownerWallet = ownerPayload.ownerId;
    } else if (body.ownerWallet) {
      // Legacy/mobile flow: Rchatfi calls this endpoint directly with a raw wallet
      // address in the body, with no owner session token. Preserved as-is so the
      // mobile app keeps working without requiring an app update.
      ownerCollection = "storeWallets";
      ownerIdentifier = body.ownerWallet;
      ownerWallet = body.ownerWallet;
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username, name, description, logo, banner, favicon, category, theme, contact, shipping, loyalty, analytics, countdownPromo, live } = body;

    if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

    const existing = await db.collection("storeUsernames").doc(username).get();
    if (existing.exists && existing.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const keySnap = await db.collection("storeKeys").doc(username).get();
    const isNewStore = !keySnap.exists;
    let apiKeyPrefix = "";
    let newApiKey: string | null = null; // only set (and returned) on first creation
    if (isNewStore) {
      newApiKey = generateApiKey(username);
      apiKeyPrefix = newApiKey.substring(0, 20);
      await db.collection("storeKeys").doc(username).set({
        username,
        ownerWallet,
        apiKey: newApiKey,
        apiKeyPrefix,
        createdAt: new Date().toISOString(),
        lastUsed: null,
      });
    } else {
      apiKeyPrefix = keySnap.data()!.apiKeyPrefix;
    }

    const storeUpdate: any = {
      username,
      ownerWallet,
      updatedAt: new Date().toISOString(),
    };

    // Partial-update semantics: only write a field if the caller actually sent it,
    // or default it when the store is first being created. This way a screen that
    // only updates one thing (e.g. just the template) can never silently blank out
    // every other field on the store.
    const setIfProvidedOrNew = (key: string, value: any, defaultValue: any) => {
      if (value !== undefined) {
        storeUpdate[key] = value;
      } else if (isNewStore) {
        storeUpdate[key] = defaultValue;
      }
    };

    setIfProvidedOrNew('name', name, "");
    setIfProvidedOrNew('description', description, "");
    setIfProvidedOrNew('logo', logo, "");
    setIfProvidedOrNew('banner', banner, "");
    setIfProvidedOrNew('favicon', favicon, "");
    setIfProvidedOrNew('category', category, "");
    setIfProvidedOrNew('contact', contact, {});
    setIfProvidedOrNew('theme', theme, { primary: "#9945FF", bg: "#000000" });
    setIfProvidedOrNew('template', body.template, 'dark');
    setIfProvidedOrNew('shipping', shipping, { flatFee: 0, freeThreshold: null, pickupEnabled: false, pickupAddress: '' });
    setIfProvidedOrNew('loyalty', loyalty, { enabled: false, earnRate: 1, redeemValue: 1 });
    setIfProvidedOrNew('analytics', analytics, { gaId: '', fbPixelId: '' });
    setIfProvidedOrNew('countdownPromo', countdownPromo, { enabled: false, message: '', endsAt: null });
    setIfProvidedOrNew('live', live, false);

    if (isNewStore) {
      storeUpdate.live = false;
      storeUpdate.createdAt = new Date().toISOString();
    }

    await db.collection("stores").doc(username).set(storeUpdate, { merge: true });

    await db.collection("storeUsernames").doc(username).set({ username, ownerWallet });

    const ownerRef = db.collection(ownerCollection).doc(ownerIdentifier);
    const ownerSnap = await ownerRef.get();
    if (!ownerSnap.exists) {
      await ownerRef.set({ ownerWallet, usernames: [username], activeUsername: username });
    } else {
      const update: any = { usernames: FieldValue.arrayUnion(username) };
      if (isNewStore) update.activeUsername = username;
      await ownerRef.set(update, { merge: true });
    }

    return NextResponse.json({ success: true, apiKeyPrefix, apiKey: newApiKey });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
