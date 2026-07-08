import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

// GET /api/store/[slug]/stats — analytics summary + last 30 days + top products
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Overall summary
    const summarySnap = await db.collection("stores").doc(slug).collection("stats").doc("summary").get();
    const summary = summarySnap.exists ? summarySnap.data()! : { totalRevenue: 0, totalOrders: 0 };

    // Last 30 days daily stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const fromKey = thirtyDaysAgo.toISOString().slice(0, 10);

    const dailySnap = await db.collection("stores").doc(slug).collection("dailyStats")
      .where("date", ">=", fromKey)
      .orderBy("date", "asc")
      .get();

    const daily = dailySnap.docs.map(d => ({
      date: d.data().date,
      revenue: d.data().revenue || 0,
      orders: d.data().orders || 0,
    }));

    // Fill in missing days with zeros so the chart has a full 30-day array
    const filledDaily: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const found = daily.find(r => r.date === key);
      filledDaily.push(found || { date: key, revenue: 0, orders: 0 });
    }

    // Customer stats
    const customersSnap = await db.collection("stores").doc(slug).collection("customers").get();
    const totalCustomers = customersSnap.size;
    const repeatCustomers = customersSnap.docs.filter(d => (d.data().orderCount || 0) > 1).length;

    // Top 5 products by units sold
    const productsSnap = await db.collection("stores").doc(slug).collection("products")
      .orderBy("unitsSold", "desc").limit(5).get();
    const topProducts = productsSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      unitsSold: d.data().unitsSold || 0,
      price: d.data().price || 0,
    }));

    // This week vs last week revenue
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekRevenue = filledDaily
      .filter(d => d.date >= weekStart.toISOString().slice(0, 10))
      .reduce((s, d) => s + d.revenue, 0);
    const lastWeekRevenue = filledDaily
      .filter(d => d.date >= lastWeekStart.toISOString().slice(0, 10) && d.date < weekStart.toISOString().slice(0, 10))
      .reduce((s, d) => s + d.revenue, 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue: summary.totalRevenue || 0,
        totalOrders: summary.totalOrders || 0,
        totalCustomers,
        repeatCustomers,
        thisWeekRevenue,
        lastWeekRevenue,
        weekOverWeekChange: lastWeekRevenue > 0
          ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
          : null,
      },
      daily: filledDaily,
      topProducts,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
