import React from "react";

const BASE = "https://chatfipay-z9xh.vercel.app/api";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#0F0F0F] text-white px-4 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-10">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">ChatFi <span className="text-[#AAFF00]">Pay</span> Docs</h1>
          <p className="text-gray-400 text-sm mt-2">Accept Solana payments via API. Simple, fast, non-custodial.</p>
        </div>

        {/* Getting Started */}
        <Section title="Getting Started">
          <Step n={1} title="Open ChatFi App">
            Go to <b>More → Merchant</b> in the ChatFi app.
          </Step>
          <Step n={2} title="Generate an API Key">
            Tap <b>Generate API Key</b>. Your key starts with <code className="text-[#AAFF00]">cfp_</code>. Keep it secret — it identifies your wallet.
          </Step>
          <Step n={3} title="Set a Webhook (optional)">
            Add a webhook URL to receive a POST request when a payment is confirmed.
          </Step>
        </Section>

        {/* Create Payment Link */}
        <Section title="Create a Payment Link">
          <p className="text-gray-400 text-sm mb-4">Send a POST request to create a payment link your customers can pay via browser or wallet.</p>
          <CodeBlock method="POST" endpoint={`${BASE}/payment`} />
          <div className="flex flex-col gap-3 mt-4">
            <Label>Headers</Label>
            <Pre>{`x-api-key: cfp_YOUR_KEY
Content-Type: application/json`}</Pre>
            <Label>Body</Label>
            <Pre>{`{
  "amount": 0.05,       // SOL amount (optional — omit for open amount)
  "label": "Invoice #001",
  "memo": "Payment for design work"  // optional
}`}</Pre>
            <Label>Response</Label>
            <Pre>{`{
  "success": true,
  "id": "abc123",
  "link": "https://chatfipay-z9xh.vercel.app/pay/abc123",
  "amount": 0.05,
  "label": "Invoice #001",
  "status": "pending"
}`}</Pre>
          </div>
        </Section>

        {/* Check Payment Status */}
        <Section title="Check Payment Status">
          <CodeBlock method="GET" endpoint={`${BASE}/payment?id=PAYMENT_ID`} />
          <div className="flex flex-col gap-3 mt-4">
            <Label>Headers</Label>
            <Pre>{`x-api-key: cfp_YOUR_KEY`}</Pre>
            <Label>Response</Label>
            <Pre>{`{
  "id": "abc123",
  "status": "completed",  // "pending" | "completed"
  "amount": 0.05,
  "label": "Invoice #001",
  "paidAt": "2026-06-16T10:00:00.000Z",
  "txSignature": "5Fo8VJqG..."
}`}</Pre>
          </div>
        </Section>

        {/* Webhook */}
        <Section title="Webhook Payload">
          <p className="text-gray-400 text-sm mb-4">When a payment is confirmed, ChatFi POSTs this to your webhook URL.</p>
          <Pre>{`{
  "id": "abc123",
  "status": "completed",
  "amount": 0.05,
  "label": "Invoice #001",
  "memo": "Payment for design work",
  "walletAddress": "7tsf2T6S...",
  "txSignature": "5Fo8VJqG...",
  "paidAt": "2026-06-16T10:00:00.000Z"
}`}</Pre>
        </Section>

        {/* Quick Example */}
        <Section title="Quick Example (Node.js)">
          <Pre>{`const res = await fetch("${BASE}/payment", {
  method: "POST",
  headers: {
    "x-api-key": "cfp_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: 0.05,
    label: "Order #42",
    memo: "T-shirt XL",
  }),
});

const { link } = await res.json();
// Redirect customer to: link`}</Pre>
        </Section>

        {/* Fees */}
        <Section title="Fees">
          <div className="bg-[#0d1a0d] border border-[#1a2e1a] rounded-xl p-4 text-sm text-[#C7F284]">
            ⚡ 1% fee is deducted per confirmed transaction processed via API.
          </div>
        </Section>

        <p className="text-gray-600 text-xs text-center pb-8">Powered by ChatFi · Built on Solana</p>
      </div>
    </main>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-700 text-white border-b border-[#1a1a1a] pb-2">{title}</h2>
    {children}
  </div>
);

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-4">
    <div className="w-7 h-7 rounded-full bg-[#C7F284] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
    <div>
      <p className="text-white font-600 text-sm">{title}</p>
      <p className="text-gray-400 text-sm mt-1">{children}</p>
    </div>
  </div>
);

const CodeBlock = ({ method, endpoint }: { method: string; endpoint: string }) => (
  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3 flex items-center gap-3">
    <span className="text-[#C7F284] font-bold text-sm">{method}</span>
    <span className="text-gray-400 text-xs font-mono break-all">{endpoint}</span>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-gray-500 text-xs uppercase tracking-wider">{children}</p>
);

const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{children}</pre>
);
