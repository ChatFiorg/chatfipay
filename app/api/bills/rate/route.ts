import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [usdcRes, fxRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd'),
      fetch('https://api.exchangerate-api.com/v4/latest/USD'),
    ]);
    const usdcData = await usdcRes.json();
    const fxData   = await fxRes.json();
    const usdcUsd  = usdcData?.['usd-coin']?.usd || 1;
    const usdNgn   = fxData?.rates?.NGN || 1620;
    const rate     = usdcUsd * usdNgn;
    return NextResponse.json({ success: true, rate: Math.floor(rate), usdNgn, usdcUsd });
  } catch (e: any) {
    return NextResponse.json({ success: true, rate: 1620, fallback: true });
  }
}
