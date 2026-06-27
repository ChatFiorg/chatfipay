"use client";
import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

const TOKENS = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  { symbol: "SOL", mint: "native" },
];

interface Props {
  walletAddress: string;
  amount: number | null;
  token?: string;
}

const ManualPay = ({ walletAddress, amount, token = "USDC" }: Props) => {
  const [copied, setCopied] = useState(false);
  const defaultToken = TOKENS.find(t => t.symbol === token) || TOKENS[0];
  const [selectedToken, setSelectedToken] = useState(defaultToken);

  const displayAmount = (): string => {
    if (!amount) return "";
    // Amount is already in the payment token (USDC for store payments)
    // For SOL tab, just show the raw amount with a note
    return amount.toString();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(walletAddress)}&color=C7F284&bgcolor=141414`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Token selector — USDC first */}
      <div className="flex gap-2 w-full bg-[#1A1A1A] rounded-xl p-1">
        {TOKENS.map((t) => (
          <button
            key={t.symbol}
            onClick={() => setSelectedToken(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedToken.symbol === t.symbol
                ? t.symbol === "SOL"
                  ? "bg-[#333] text-gray-300"
                  : "bg-white text-black"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.symbol}
          </button>
        ))}
      </div>

      {amount && (
        <div className="w-full bg-[#1A1A1A] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs uppercase tracking-wide">Send exactly</p>
          <p className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${selectedToken.symbol === 'SOL' ? 'text-gray-400' : 'text-[#C7F284]'}`}>
            {displayAmount()} {selectedToken.symbol === 'SOL' ? token : selectedToken.symbol}
          </p>
          {selectedToken.symbol === 'SOL' && (
            <p className="text-gray-500 text-xs mt-1">SOL payments not supported for store orders. Use USDC or USDT.</p>
          )}
        </div>
      )}

      {/* QR */}
      <div className="border border-[#C7F284] rounded-2xl p-4 bg-[#141414]">
        <img src={qrUrl} alt="Wallet QR" width={180} height={180} />
      </div>

      {/* Address */}
      <div className="w-full bg-[#1A1A1A] rounded-xl p-4 flex items-center gap-3">
        <p className="text-gray-300 text-xs font-mono tracking-wide flex-1 break-all">{walletAddress}</p>
        <button onClick={copy} className="shrink-0">
          {copied
            ? <Check size={18} className="text-[#C7F284]" />
            : <Copy size={18} className="text-gray-400" />
          }
        </button>
      </div>

      <p className="text-gray-600 text-xs text-center px-2">
        Send {selectedToken.symbol === 'SOL' ? token : selectedToken.symbol} to the address above from any wallet or exchange on Solana.
      </p>
    </div>
  );
};

export default ManualPay;
