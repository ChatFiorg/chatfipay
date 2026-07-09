import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

function generateApiKey(username: string) {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `sk_store_${username}_${rand}`;
}

// POST /api/store/[slug]/regenerate-key — invalidates the old key and returns a new one once.
// Use when a device never received the original key (e.g. stores created before the
// full-key-on-creation fix), or if a merchant suspects their key was exposed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { ownerWallet } = body;

    const storeSnap = await db.collection("stores").doc(slug).get();
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    let walletMatches = false;
    if (ownerWallet) {
      const ownerWalletSnap = await db.collection("storeWallets").doc(ownerWallet).get();
      const usernames: string[] = ownerWalletSnap.data()?.usernames || [];
      walletMatches = usernames.includes(slug);
    }
    const sessionAuthorized = await verifyStoreAccess(req, slug);
    if (!walletMatches && !sessionAuthorized) {
      return NextResponse.json({ error: "Not authorized for this store" }, { status: 403 });
    }

    const newApiKey = generateApiKey(slug);
    const apiKeyPrefix = newApiKey.substring(0, 20);

    await db.collection("storeKeys").doc(slug).set({
      username: slug,
      ownerWallet: ownerWallet || storeSnap.data()!.ownerWallet || null,
      apiKey: newApiKey,
      apiKeyPrefix,
      createdAt: new Date().toISOString(),
      lastUsed: null,
    }, { merge: true });

    return NextResponse.json({ success: true, apiKey: newApiKey, apiKeyPrefix });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
