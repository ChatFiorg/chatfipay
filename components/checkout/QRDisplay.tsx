"use client";
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface QRDisplayProps {
  link: string;
}

const QRDisplay = ({ link }: QRDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}&color=AAFF00&bgcolor=141414`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#AAFF00]/40 bg-[#AAFF00]/5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#AAFF00]" />
        <span className="text-[#AAFF00] text-[11px] font-semibold tracking-wide">
          Solana network only
        </span>
      </div>
      <div className="border border-[#AAFF00] rounded-2xl p-4 bg-[#141414]">
        <img src={qrUrl} alt="QR Code" width={200} height={200} />
      </div>
      <p className="text-gray-500 text-xs text-center break-all px-4 font-mono">{link}</p>
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
