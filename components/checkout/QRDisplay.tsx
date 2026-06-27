"use client";
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { buildSolanaPayUrl } from "@/lib/solanaPay";

interface QRDisplayProps {
  link: string;
  walletAddress: string;
  amount: number | null;
  token?: string;
  label?: string;
  paymentId: string;
}

const QRDisplay = ({ link, walletAddress, amount, token = "SOL", label, paymentId }: QRDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const payUrl = buildSolanaPayUrl({
    walletAddress, amount, token, label, reference: paymentId, message: "Payment via ChatFi Pay",
  });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payUrl)}&color=C7F284&bgcolor=141414`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="border border-[#C7F284] rounded-2xl p-4 bg-[#141414]">
        <img src={qrUrl} alt="QR Code" width={200} height={200} />
      </div>
      <p className="text-gray-500 text-xs text-center break-all px-4 font-mono">{link}</p>
      <button
        onClick={copy}
        className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded-xl px-5 py-3 text-sm font-semibold hover:border-[#C7F284] transition-all"
      >
        {copied ? <Check size={16} className="text-[#C7F284]" /> : <Copy size={16} />}
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
};

export default QRDisplay;
