import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getTerminalStates, getTerminalCities } from "@/lib/terminalAfrica";

// GET /api/store/[slug]/shipping/cities?state=Oyo
// Returns Terminal Africa's own valid city list for the given Nigerian
// state, using the store's saved Terminal API key. Needed because Terminal
// only recognizes a curated list of major cities per state (not the full
// ~774 Nigerian LGA breakdown), so free-text/LGA values are frequently
// rejected as "Invalid city" during rate requests.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const stateName = searchParams.get("state");

  if (!stateName) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }

  try {
    const keySnap = await db.collection("storeKeys").doc(slug).get();
    const terminalApiKey = keySnap.exists ? keySnap.data()!.terminalApiKey : null;
    if (!terminalApiKey) {
      return NextResponse.json({ success: true, cities: [] });
    }

    const states = await getTerminalStates(terminalApiKey);
    const matched = states.find(s => s.name.toLowerCase() === stateName.toLowerCase());
    if (!matched) {
      return NextResponse.json({ success: true, cities: [] });
    }

    const cities = await getTerminalCities(terminalApiKey, matched.isoCode);
    return NextResponse.json({ success: true, cities: cities.map(c => c.name) });
  } catch (e: any) {
    console.error("Terminal cities lookup error:", e);
    return NextResponse.json({ success: true, cities: [], error: e.message });
  }
}
