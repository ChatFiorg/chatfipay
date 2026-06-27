import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

function generateApiKey(username: string) {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `sk_store_${username}_${rand}`;
}

// GET /api/store?username=myshop OR ?wallet=7xK3...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const wallet = searchParams.get("wallet");

  if (!username && !wallet) return NextResponse.json({ error: "Missing username or wallet" }, { status: 400 });

  try {
    if (username) {
      const snap = await getDoc(doc(db, "stores", username));
      if (!snap.exists()) return NextResponse.json({ error: "Store not found" }, { status: 404 });

      const data = snap.data();
      // Get products
      const productsSnap = await getDocs(collection(db, "stores", username, "products"));
      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return NextResponse.json({ ...data, products });
    }

    if (wallet) {
      // Find store by wallet
      const usernameSnap = await getDoc(doc(db, "storeWallets", wallet));
      if (!usernameSnap.exists()) return NextResponse.json({ error: "No store for this wallet" }, { status: 404 });
      const { username: slug } = usernameSnap.data();
      const snap = await getDoc(doc(db, "stores", slug));
      const data = snap.data();

      // Get API key prefix
      const keySnap = await getDoc(doc(db, "storeKeys", slug));
      const keyData = keySnap.exists() ? keySnap.data() : {};

      return NextResponse.json({ ...data, apiKeyPrefix: keyData.apiKeyPrefix || "" });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store — create or update store
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, name, description, logo, banner, category, theme, contact } = body;

    if (!username || !ownerWallet) return NextResponse.json({ error: "Missing username or ownerWallet" }, { status: 400 });

    // Check username taken
    const existing = await getDoc(doc(db, "storeUsernames", username));
    if (existing.exists() && existing.data().ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    // Generate API key if new store
    const keySnap = await getDoc(doc(db, "storeKeys", username));
    let apiKeyPrefix = "";
    if (!keySnap.exists()) {
      const apiKey = generateApiKey(username);
      apiKeyPrefix = apiKey.substring(0, 20);
      await setDoc(doc(db, "storeKeys", username), {
        username,
        ownerWallet,
        apiKey,
        apiKeyPrefix,
        createdAt: new Date().toISOString(),
        lastUsed: null,
      });
    } else {
      apiKeyPrefix = keySnap.data().apiKeyPrefix;
    }

    // Save store
    await setDoc(doc(db, "stores", username), {
      username,
      ownerWallet,
      name: name || "",
      description: description || "",
      logo: logo || "",
      banner: banner || "",
      category: category || "",
      theme: theme || { primary: "#9945FF", bg: "#000000" },
      contact: contact || {},
      live: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });

    // Save username registry
    await setDoc(doc(db, "storeUsernames", username), { username, ownerWallet });

    // Save wallet → username lookup
    await setDoc(doc(db, "storeWallets", ownerWallet), { username, ownerWallet });

    return NextResponse.json({ success: true, apiKeyPrefix });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
