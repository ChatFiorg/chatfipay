import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs,
  doc, updateDoc, arrayUnion, arrayRemove
} from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { wallet, swapUsdValue } = await req.json();

    if (!wallet || !swapUsdValue) {
      return NextResponse.json({ error: "wallet and swapUsdValue required" }, { status: 400 });
    }

    // Find all active competitions this wallet has joined
    const q = query(collection(db, "competitions"), where("status", "==", "active"));
    const snap = await getDocs(q);

    const updates: string[] = [];

    for (const compDoc of snap.docs) {
      const comp = compDoc.data();
      const participants: any[] = comp.participants || [];

      const participant = participants.find((p: any) => p.wallet === wallet);
      if (!participant) continue;

      // Remove old entry, add updated one
      const updatedParticipant = {
        ...participant,
        volume: (participant.volume || 0) + swapUsdValue,
      };

      // Re-rank all participants
      const otherParticipants = participants.filter((p: any) => p.wallet !== wallet);
      const allUpdated = [...otherParticipants, updatedParticipant]
        .sort((a, b) => b.volume - a.volume)
        .map((p, i) => ({ ...p, rank: i + 1 }));

      await updateDoc(doc(db, "competitions", compDoc.id), {
        participants: allUpdated,
      });

      updates.push(compDoc.id);
    }

    return NextResponse.json({ updated: updates.length, competitions: updates });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
