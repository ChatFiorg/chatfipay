import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { verifyStoreAccess } from "@/lib/storeAccess";

function dateKey(d: Date) { return d.toISOString().slice(0, 10); }

// GET /api/store/[slug]/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    const toDate = toParam ? new Date(toParam) : new Date();
    const fromDate = fromParam ? new Date(fromParam) : (() => {
      const d = new Date(toDate); d.setDate(d.getDate() - 29); return d;
    })();
    const fromKey = dateKey(fromDate);
    const toKey = dateKey(toDate);

    // Daily stats across the selected range
    const dailySnap = await db.collection("stores").doc(slug).collection("dailyStats")
      .where("date", ">=", fromKey).where("date", "<=", toKey)
      .orderBy("date", "asc").get();

    const daily = dailySnap.docs.map(d => ({
      date: d.data().date,
      revenue: d.data().revenue || 0,
      orders: d.data().orders || 0,
    }));

    const filledDaily: { date: string; revenue: number; orders: number }[] = [];
    const dayCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(fromDate);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      const found = daily.find(r => r.date === key);
      filledDaily.push(found || { date: key, revenue: 0, orders: 0 });
    }

    const rangeRevenue = filledDaily.reduce((s, d) => s + d.revenue, 0);
    const rangeOrders = filledDaily.reduce((s, d) => s + d.orders, 0);

    // Orders in range (for transactions + payment methods + customer new/returning)
    const ordersSnap = await db.collection("stores").doc(slug).collection("orders")
      .where("createdAt", ">=", new Date(fromKey))
      .where("createdAt", "<=", new Date(toKey + "T23:59:59"))
      .get();

    const ordersInRange = ordersSnap.docs.map(d => d.data());
    const paidOrders = ordersInRange.filter(o => o.status === "paid");
    const pendingOrders = ordersInRange.filter(o => o.status === "pending");
    const refundedOrders = ordersInRange.filter(o => o.status === "refunded");

    const amountSettled = paidOrders.reduce((s, o) => s + (o.amount || 0), 0);
    const pendingSettlement = pendingOrders.reduce((s, o) => s + (o.amount || 0), 0);
    const refundedAmount = refundedOrders.reduce((s, o) => s + (o.amount || 0), 0);

    // Platform fee only applies to USDC orders (ChatFi's own take-rate on
    // the crypto rail); Naira orders' processing fee goes entirely to
    // Paystack, not ChatFi, so they contribute $0 here.
    const totalFeesNgn = paidOrders.reduce((s, o) => {
      if (o.paymentMethod !== "usdc" || !o.amountUsdc || !o.ngnPerUsdc) return s;
      const feeUsdc = 0.2 + 0.01 * o.amountUsdc;
      return s + feeUsdc * o.ngnPerUsdc;
    }, 0);

    const paymentMethods: Record<string, { count: number; revenue: number }> = {};
    for (const o of paidOrders) {
      const method = o.paymentMethod || "unknown";
      if (!paymentMethods[method]) paymentMethods[method] = { count: 0, revenue: 0 };
      paymentMethods[method].count += 1;
      paymentMethods[method].revenue += o.amount || 0;
    }

    // Customers overall
    const customersSnap = await db.collection("stores").doc(slug).collection("customers").get();
    const totalCustomers = customersSnap.size;
    const repeatCustomers = customersSnap.docs.filter(d => (d.data().orderCount || 0) > 1).length;

    // New customers = first order falls inside range
    const newInRange = customersSnap.docs.filter(d => {
      const first = d.data().firstOrderAt?.toDate?.();
      if (!first) return false;
      const key = dateKey(first);
      return key >= fromKey && key <= toKey;
    }).length;
    const returningInRange = paidOrders.length > 0
      ? new Set(paidOrders.map(o => o.customerPhone).filter(Boolean)).size - newInRange
      : 0;

    const avgSpendPerCustomer = totalCustomers > 0 ? rangeRevenue / totalCustomers : 0;

    // Products summary (not date-filtered, current snapshot)
    const productsSnap = await db.collection("stores").doc(slug).collection("products").get();
    let totalStockQty = 0, inventoryValue = 0, outOfStock = 0, variations = 0;
    for (const d of productsSnap.docs) {
      const p = d.data();
      const stock = typeof p.stock === "number" ? p.stock : 0;
      totalStockQty += stock;
      inventoryValue += stock * (p.price || 0);
      if (p.stock === 0) outOfStock += 1;
      if (Array.isArray(p.variants)) variations += p.variants.length;
    }

    const topProductsSnap = await db.collection("stores").doc(slug).collection("products")
      .orderBy("unitsSold", "desc").limit(5).get();
    const topProducts = topProductsSnap.docs.map(d => ({
      id: d.id, name: d.data().name, unitsSold: d.data().unitsSold || 0, price: d.data().price || 0,
    }));

    const lowStock = productsSnap.docs
      .map(d => ({ id: d.id, name: d.data().name, stock: d.data().stock }))
      .filter(p => p.stock != null && p.stock <= 5)
      .sort((a, b) => (a.stock || 0) - (b.stock || 0))
      .slice(0, 10);

    // Week-over-week (still based on today, not the selected range)
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const thisWeekRevenue = filledDaily.filter(d => d.date >= dateKey(weekStart)).reduce((s, d) => s + d.revenue, 0);
    const lastWeekRevenue = filledDaily.filter(d => d.date >= dateKey(lastWeekStart) && d.date < dateKey(weekStart)).reduce((s, d) => s + d.revenue, 0);

    return NextResponse.json({
      success: true,
      range: { from: fromKey, to: toKey },
      summary: {
        totalRevenue: rangeRevenue,
        totalFees: Math.round(totalFeesNgn),
        netRevenue: Math.round(rangeRevenue - totalFeesNgn),
        totalOrders: rangeOrders,
        totalCustomers, repeatCustomers,
        thisWeekRevenue, lastWeekRevenue,
        weekOverWeekChange: lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : null,
      },
      transactions: {
        totalTransactions: rangeRevenue,
        pendingSettlement,
        amountSettled,
        refunded: refundedAmount,
      },
      products: {
        totalProducts: productsSnap.size,
        totalStockQty, inventoryValue, outOfStock, variations,
      },
      customers: {
        newInRange, returningInRange: Math.max(returningInRange, 0), avgSpendPerCustomer,
      },
      daily: filledDaily,
      topProducts,
      lowStock,
      paymentMethods,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
