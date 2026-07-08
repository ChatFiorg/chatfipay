import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/expenses — list expenses + summary (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await db.collection("stores").doc(slug).collection("expenses")
      .orderBy("date", "desc").limit(200).get();

    const expenses = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        category: data.category,
        amount: data.amount,
        note: data.note || "",
        date: data.date?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const statsSnap = await db.collection("stores").doc(slug).collection("stats").doc("summary").get();
    const totalRevenue = statsSnap.exists ? (statsSnap.data()!.totalRevenue || 0) : 0;

    return NextResponse.json({
      success: true,
      expenses,
      summary: {
        totalExpenses,
        totalRevenue,
        netProfit: totalRevenue - totalExpenses,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/[slug]/expenses — create an expense (owner only)
// body: { category, amount, note?, date? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const category = String(body.category || "").trim();
    const amount = Number(body.amount);

    if (!category) return NextResponse.json({ error: "Category is required" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });

    const ref = db.collection("stores").doc(slug).collection("expenses").doc();
    await ref.set({
      category,
      amount,
      note: body.note ? String(body.note).trim() : "",
      date: body.date ? Timestamp.fromDate(new Date(body.date)) : Timestamp.now(),
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
