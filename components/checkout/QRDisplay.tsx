"use client";
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface QRDisplayProps {
  link: string;
  amount: number | null;
  label: string;
}

const QRDisplay = ({ link, amount, label }: QRDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}&color=AAFF00&bgcolor=0F0F0F`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {label && <p className="text-white font-semibold text-lg">{label}</p>}
      {amount && (
        <p className="text-[#AAFF00] text-3xl font-bold">{amount} SOL</p>
      )}
      <div className="border border-[#AAFF00] rounded-2xl p-4 bg-[#0F0F0F]">
        <img src={qrUrl} alt="QR Code" width={200} height={200} />
      </div>
      <p className="text-gray-500 text-xs text-center break-all px-4">{link}</p>
      <button
        onClick={copy}
        className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded-xl px-5 py-3 text-sm font-semibold hover:border-[#AAFF00] transition-all"
      >
        {copied ? <Check size={16} className="text-[#AAFF00]" /> : <Copy size={16} />}
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
};

export default QRDisplay;
