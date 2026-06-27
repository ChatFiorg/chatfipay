import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// POST /api/store/toggle — go live or offline
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, live } = body;

    if (!username || !ownerWallet || live === undefined) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const storeSnap = await getDoc(doc(db, "stores", username));
    if (!storeSnap.exists() || storeSnap.data().ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await updateDoc(doc(db, "stores", username), { live });
    return NextResponse.json({ success: true, live });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
