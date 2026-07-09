const TERMINAL_BASE = 'https://api.terminal.africa/v1';

async function terminalRequest(apiKey: string, path: string, method: string, body?: any) {
  const res = await fetch(`${TERMINAL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.status === false) {
    throw new Error(data.message || `Terminal Africa request failed (${res.status})`);
  }
  return data.data;
}

export type TerminalAddress = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  country: string;
  zip?: string;
};

export async function createTerminalAddress(apiKey: string, address: TerminalAddress) {
  return terminalRequest(apiKey, '/addresses', 'POST', address);
}

export async function createTerminalWebhook(apiKey: string, url: string) {
  return terminalRequest(apiKey, '/webhooks', 'POST', {
    name: 'ChatFi Store Shipment Updates',
    url,
    live: true,
    events: ['shipment.created', 'shipment.updated', 'shipment.delivered', 'shipment.cancelled'],
  });
}

export async function getTerminalQuotes(apiKey: string, params: {
  pickupAddress: TerminalAddress;
  deliveryAddress: TerminalAddress;
  weightKg: number;
  value: number;
  description: string;
}) {
  return terminalRequest(apiKey, '/rates/shipment/quotes', 'POST', {
    pickup_address: params.pickupAddress,
    delivery_address: params.deliveryAddress,
    persist_data: true,
    parcel: {
      items: [
        {
          name: params.description || 'Order items',
          description: params.description || 'Order items',
          currency: 'NGN',
          value: params.value,
          weight: params.weightKg,
          quantity: 1,
        },
      ],
      description: params.description || 'Order items',
      weight_unit: 'kg',
    },
  });
}

export async function arrangeTerminalPickup(apiKey: string, rateId: string) {
  return terminalRequest(apiKey, '/shipments/pickup', 'POST', { rate_id: rateId });
}

export function verifyTerminalWebhookSignature(signature: string | null, secretKey: string, rawBody: string): boolean {
  if (!signature) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  return signature === expected;
}
