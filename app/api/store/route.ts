import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

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
    const { username, ownerWallet, name, description, logo, banner, favicon, category, theme, contact } = body;

    if (!username || !ownerWallet) return NextResponse.json({ error: "Missing username or ownerWallet" }, { status: 400 });

    const existing = await db.collection("storeUsernames").doc(username).get();
    if (existing.exists && existing.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const keySnap = await db.collection("storeKeys").doc(username).get();
    const isNewStore = !keySnap.exists;
    let apiKeyPrefix = "";
    if (isNewStore) {
      const apiKey = generateApiKey(username);
      apiKeyPrefix = apiKey.substring(0, 20);
      await db.collection("storeKeys").doc(username).set({
        username,
        ownerWallet,
        apiKey,
        apiKeyPrefix,
        createdAt: new Date().toISOString(),
        lastUsed: null,
      });
    } else {
      apiKeyPrefix = keySnap.data()!.apiKeyPrefix;
    }

    await db.collection("stores").doc(username).set({
      username,
      ownerWallet,
      name: name || "",
      description: description || "",
      logo: logo || "",
      banner: banner || "",
      favicon: favicon || "",
      category: category || "",
      theme: theme || { primary: "#9945FF", bg: "#000000" },
      contact: contact || {},
      template: body.template || 'dark',
      live: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });

    await db.collection("storeUsernames").doc(username).set({ username, ownerWallet });

    const walletRef = db.collection("storeWallets").doc(ownerWallet);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      await walletRef.set({ ownerWallet, usernames: [username], activeUsername: username });
    } else {
      const update: any = { usernames: FieldValue.arrayUnion(username) };
      if (isNewStore) update.activeUsername = username;
      await walletRef.set(update, { merge: true });
    }

    return NextResponse.json({ success: true, apiKeyPrefix });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
