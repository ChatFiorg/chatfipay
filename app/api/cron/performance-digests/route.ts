import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { sendPerformanceDigest } from "@/lib/performanceDigest";

// GET /api/cron/performance-digests — triggered daily by Vercel Cron.
// Sends the "daily" digest every run. Also sends "weekly" on Mondays and
// "monthly" on the 1st of the month, so a single daily cron slot covers all
// three cadences without needing separate cron entries (Vercel Hobby plan
// only supports daily-granularity schedules).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    const isFirstOfMonth = now.getUTCDate() === 1;

    const storesSnap = await db.collection("stores").get();
    let processed = 0;

    for (const doc of storesSnap.docs) {
      const slug = doc.id;
      try {
        await sendPerformanceDigest(slug, "daily");
        if (isMonday) await sendPerformanceDigest(slug, "weekly");
        if (isFirstOfMonth) await sendPerformanceDigest(slug, "monthly");
        processed++;
      } catch (e) {
        console.error(`Digest failed for store ${slug}:`, e);
      }
    }

    return NextResponse.json({ success: true, processed, ranWeekly: isMonday, ranMonthly: isFirstOfMonth });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
