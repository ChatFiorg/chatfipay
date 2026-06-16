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
    fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112")
      .then(r => r.json())
      .then(d => {
        const price = d?.data?.["So11111111111111111111111111111111111111112"]?.price;
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
      <div className="flex gap-2 w-full">
        {TOKENS.map((token) => (
          <button
            key={token.symbol}
            onClick={() => setSelectedToken(token)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
              selectedToken.symbol === token.symbol
                ? "border-[#AAFF00] text-[#AAFF00] bg-[#AAFF00]/10"
                : "border-[#2A2A2A] text-gray-400"
            }`}
          >
            {token.symbol}
          </button>
        ))}
      </div>

      {amount && (
        <div className="w-full bg-[#1A1A1A] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-sm">Send exactly</p>
          <p className="text-[#AAFF00] text-2xl font-bold">{convertedAmount()} {selectedToken.symbol}</p>
        </div>
      )}

      {/* QR */}
      <div className="border border-[#AAFF00] rounded-2xl p-4 bg-[#141414]">
        <img src={qrUrl} alt="Wallet QR" width={180} height={180} />
      </div>

      {/* Address */}
      <div className="w-full bg-[#1A1A1A] rounded-xl p-4 flex items-center gap-3">
        <p className="text-gray-300 text-xs font-mono flex-1 break-all">{walletAddress}</p>
        <button onClick={copy} className="shrink-0">
          {copied
            ? <Check size={18} className="text-[#AAFF00]" />
            : <Copy size={18} className="text-gray-400" />
          }
        </button>
      </div>

      <div className="w-full bg-[#1A1A1A] rounded-xl p-3">
        <p className="text-gray-500 text-xs text-center">
          Send {selectedToken.symbol} to the address above from any wallet or exchange.
          {selectedToken.symbol !== "SOL" && " Make sure you send on Solana network."}
        </p>
      </div>
    </div>
  );
};

export default ManualPay;
