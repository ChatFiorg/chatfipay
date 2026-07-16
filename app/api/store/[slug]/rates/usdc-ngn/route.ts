import { NextRequest, NextResponse } from "next/server";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Simple in-memory cache — fine for a single serverless region.
// If you ever run multi-region, swap this for a Firestore/KV-backed cache.
let cached: { rate: number; updatedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 min

async function getUsdPerUsdc(): Promise<number> {
  const res = await fetch(`https://api.jup.ag/price/v2?ids=${USDC_MINT}`);
  const data = await res.json();
  const price = parseFloat(data?.data?.[USDC_MINT]?.price);
  if (!price || price <= 0) throw new Error("bad USDC price");
  return price;
}

async function getNgnPerUsd(): Promise<number> {
  const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  const data = await res.json();
  const rate = data?.rates?.NGN;
  if (!rate || rate <= 0) throw new Error("bad NGN rate");
  return rate;
}

async function getUsdcNgnRate(): Promise<number> {
  if (cached && Date.now() - cached.updatedAt < TTL_MS) {
    return cached.rate;
  }
  const [usdPerUsdc, ngnPerUsd] = await Promise.all([
    getUsdPerUsdc(),
    getNgnPerUsd(),
  ]);
  const rate = usdPerUsdc * ngnPerUsd; // NGN per 1 USDC
  cached = { rate, updatedAt: Date.now() };
  return rate;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  await context.params;
  try {
    const rate = await getUsdcNgnRate();
    return NextResponse.json({ rate, updatedAt: Date.now() });
  } catch (e) {
    console.error("usdc-ngn rate fetch failed:", e);
    return NextResponse.json({ error: "rate_unavailable" }, { status: 502 });
  }
}
