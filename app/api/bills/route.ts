import { NextRequest, NextResponse } from 'next/server';

const PEYFLEX_BASE  = 'https://portal.peyflex.com.ng/api/v1';
const PEYFLEX_TOKEN = process.env.PEYFLEX_API_TOKEN || '';

const NETWORK_MAP: Record<string, string> = {
  mtn: 'mtn_airtime',
  airtel: 'airtel_airtime',
  glo: 'glo_airtime',
  '9mobile': '9mobile_airtime',
};

async function peyflexGet(path: string) {
  const url = `${PEYFLEX_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST', // Peyflex airtime endpoint is POST even with query params
    headers: {
      'Authorization': PEYFLEX_TOKEN,
      'source-domain': 'https://chatfi.pro',
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Peyflex returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

// GET /api/bills?type=balance
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  try {
    if (type === 'balance') {
      const data = await peyflexGet(`/balance?format=json&api-token=${PEYFLEX_TOKEN}`);
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST /api/bills  body: { type: 'airtime', network, amount, mobile_number }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type } = body;

  try {
    if (type === 'airtime') {
      const { network, amount, mobile_number } = body;
      if (!network || !amount || !mobile_number)
        return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });

      const networkCode = NETWORK_MAP[network.toLowerCase()] || `${network.toLowerCase()}_airtime`;
      const phone = mobile_number.startsWith('0') ? mobile_number : `0${mobile_number}`;

      const data = await peyflexGet(
        `/airtime?format=json&phone=${phone}&amount=${amount}&network=${networkCode}&api-token=${PEYFLEX_TOKEN}`
      );

      if (data.status === 201 || data.status === '201' || data.message === 'success') {
        return NextResponse.json({ success: true, message: 'Airtime sent!', data });
      }
      return NextResponse.json({ success: false, error: data.details || data.message || 'Airtime failed', data }, { status: 400 });
    }

    return NextResponse.json({ success: false, error: 'Invalid type — only airtime implemented' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
