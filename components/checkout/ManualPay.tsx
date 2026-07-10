"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Copy, Check, Loader2 } from "lucide-react";

const TOKENS = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  { symbol: "SOL", mint: "native" },
];

interface Props {
  walletAddress: string;
  amount: number | null;
  token?: string;
  paymentId?: string;
  storeUsername?: string;
}

const ManualPay = ({ walletAddress, amount, token = "USDC", paymentId, storeUsername }: Props) => {
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const defaultToken = TOKENS.find(t => t.symbol === token) || TOKENS[0];
  const [selectedToken, setSelectedToken] = useState(defaultToken);

  const pollPayment = useCallback(async () => {
    if (!paymentId) return false;
    try {
      const res = await fetch(`/api/verify/${paymentId}`);
      const data = await res.json();
      if (data.status === "completed") {
        setPaid(true);
        setPolling(false);
        if (storeUsername) {
          setTimeout(() => {
            window.location.href = `https://store.chatfi.pro/${storeUsername}?order=${paymentId}&paid=true`;
          }, 2000);
        }
        return true;
      }
    } catch {}
    return false;
  }, [paymentId, storeUsername]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      setPollCount(c => c + 1);
      const done = await pollPayment();
      if (done) clearInterval(interval);
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, pollPayment]);

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#C7F284]/10 border border-[#C7F284]/30 flex items-center justify-center">
          <Check size={32} className="text-[#C7F284]" />
        </div>
        <p className="text-[#C7F284] text-xl font-bold">Payment Received!</p>
        <p className="text-gray-400 text-sm">Redirecting you back to store...</p>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(walletAddress)}&color=C7F284&bgcolor=141414`;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Token selector */}
      <div className="flex gap-2 w-full bg-[#0A0A0A] rounded-xl p-1">
        {TOKENS.map((t) => (
          <button
            key={t.symbol}
            onClick={() => setSelectedToken(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedToken.symbol === t.symbol
                ? t.symbol === "SOL" ? "bg-[#333] text-gray-300" : "bg-white text-black"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.symbol}
          </button>
        ))}
      </div>

      {amount && (
        <div className="w-full bg-[#0A0A0A] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs uppercase tracking-wide">Send exactly</p>
          <p className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${selectedToken.symbol === 'SOL' ? 'text-gray-400' : 'text-[#C7F284]'}`}>
            {amount} {selectedToken.symbol === 'SOL' ? token : selectedToken.symbol}
          </p>
          {selectedToken.symbol === 'SOL' && (
            <p className="text-gray-500 text-xs mt-1">Use USDC or USDT for store orders.</p>
          )}
        </div>
      )}

      {/* QR */}
      <div className="relative border border-[#C7F284] rounded-2xl p-4 bg-[#000000]">
        <img
          src={qrUrl}
          alt="Wallet QR"
          width={180}
          height={180}
          className={selectedToken.symbol === 'SOL' ? 'opacity-20 pointer-events-none' : ''}
        />
        {selectedToken.symbol === 'SOL' && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <p className="text-gray-400 text-xs text-center">Not available for SOL</p>
          </div>
        )}
      </div>

      {/* Address */}
      <div className="w-full bg-[#0A0A0A] rounded-xl p-4 flex items-center gap-3">
        {selectedToken.symbol === 'SOL' ? (
          <p className="text-gray-500 text-xs flex-1 text-center">Not available for SOL</p>
        ) : (
          <>
            <p className="text-gray-300 text-xs font-mono tracking-wide flex-1 break-all">{walletAddress}</p>
            <button onClick={copy} className="shrink-0">
              {copied ? <Check size={18} className="text-[#C7F284]" /> : <Copy size={18} className="text-gray-400" />}
            </button>
          </>
        )}
      </div>

      {selectedToken.symbol !== 'SOL' && (
        <p className="text-gray-600 text-xs text-center px-2">
          Send {selectedToken.symbol} to the address above from any wallet or exchange on Solana.
        </p>
      )}

      {/* I've sent it button */}
      {selectedToken.symbol !== 'SOL' && !polling && (
        <button
          onClick={() => setPolling(true)}
          className="w-full bg-[#0A0A0A] border border-[#C7F284]/30 text-[#C7F284] font-semibold rounded-xl py-3 text-sm hover:bg-[#C7F284]/10 transition-all"
        >
          I've sent it — confirm payment
        </button>
      )}

      {polling && (
        <div className="flex flex-col items-center gap-2 w-full py-2">
          <div className="flex items-center gap-2 text-[#C7F284]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-medium">
              Checking blockchain{pollCount > 0 ? ` (${pollCount})` : '...'}
            </span>
          </div>
          <p className="text-gray-500 text-xs text-center">This may take 10–30 seconds after sending</p>
          <button onClick={() => setPolling(false)} className="text-gray-600 text-xs underline">Cancel</button>
        </div>
      )}
    </div>
  );
};

export default ManualPay;
