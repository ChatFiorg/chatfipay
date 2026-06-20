"use client";
import React, { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";

const TOKENS = [
  { symbol: "SOL", mint: "native" },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
];

interface Props {
  walletAddress: string;
  amount: number | null;
}

const ManualPay = ({ walletAddress, amount }: Props) => {
  const [copied, setCopied] = useState(false);
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [solPrice, setSolPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then(r => r.json())
      .then(d => {
        const price = d?.solana?.usd;
        if (price) setSolPrice(parseFloat(price));
      })
      .catch(() => {});
  }, []);

  const convertedAmount = (): string => {
    if (!amount) return "";
    if (selectedToken.symbol === "SOL") return amount.toString();
    if (!solPrice) return "...";
    return (amount * solPrice).toFixed(2);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(walletAddress)}&color=AAFF00&bgcolor=141414`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Token selector */}
      <div className="flex gap-2 w-full bg-[#1A1A1A] rounded-xl p-1">
        {TOKENS.map((token) => (
          <button
            key={token.symbol}
            onClick={() => setSelectedToken(token)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedToken.symbol === token.symbol
                ? "bg-white text-black"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {token.symbol}
          </button>
        ))}
      </div>

      {amount && (
        <div className="w-full bg-[#1A1A1A] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs uppercase tracking-wide">Send exactly</p>
          <p className="text-[#AAFF00] text-2xl font-bold font-mono tabular-nums mt-0.5">
            {convertedAmount()} {selectedToken.symbol}
          </p>
        </div>
      )}

      {/* Network badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#AAFF00]/40 bg-[#AAFF00]/5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#AAFF00]" />
        <span className="text-[#AAFF00] text-[11px] font-semibold tracking-wide">
          Solana network only
        </span>
      </div>

      {/* QR */}
      <div className="border border-[#AAFF00] rounded-2xl p-4 bg-[#141414]">
        <img src={qrUrl} alt="Wallet QR" width={180} height={180} />
      </div>

      {/* Address */}
      <div className="w-full bg-[#1A1A1A] rounded-xl p-4 flex items-center gap-3">
        <p className="text-gray-300 text-xs font-mono tracking-wide flex-1 break-all">{walletAddress}</p>
        <button onClick={copy} className="shrink-0">
          {copied
            ? <Check size={18} className="text-[#AAFF00]" />
            : <Copy size={18} className="text-gray-400" />
          }
        </button>
      </div>

      <p className="text-gray-600 text-xs text-center px-2">
        Send {selectedToken.symbol} to the address above from any wallet or exchange on Solana.
      </p>
    </div>
  );
};

export default ManualPay;
