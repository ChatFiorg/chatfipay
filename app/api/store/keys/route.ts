import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

function generateApiKey(username: string) {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `sk_store_${username}_${rand}`;
}

// POST /api/store/keys — regenerate API key
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet } = body;

    if (!username || !ownerWallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const storeSnap = await getDoc(doc(db, "stores", username));
    if (!storeSnap.exists() || storeSnap.data().ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = generateApiKey(username);
    const apiKeyPrefix = apiKey.substring(0, 20);

    await setDoc(doc(db, "storeKeys", username), {
      username,
      ownerWallet,
      apiKey,
      apiKeyPrefix,
      regeneratedAt: new Date().toISOString(),
      lastUsed: null,
    }, { merge: true });

    return NextResponse.json({ success: true, apiKeyPrefix, apiKey });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
