"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Check, Loader2, ChevronDown } from "lucide-react";

interface PayButtonProps {
  paymentId: string;
  walletAddress: string;
  amount: number | null;
  label: string;
  token?: string;
  storeUsername?: string;
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const WALLETS = [
  { name: "Phantom", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/32b36a4f-e34e-47b4-9479-b69f8aa083b3.png", scheme: "phantom" },
  { name: "Solflare", icon: "https://www.google.com/s2/favicons?domain=solflare.com&sz=64", scheme: "solflare" },
  { name: "Backpack", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/4c541c9b-7cb2-4778-88b4-e87c4cb17a77.jpg", scheme: "backpack" },
  { name: "OKX Wallet", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/9012d520-8d9c-4bd9-a2cf-4d68f1b43886.png", scheme: "okex" },
  { name: "Coinbase Wallet", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/8879db2c-c868-4c79-9b87-f63a403c1697.png", scheme: "cbwallet" },
  { name: "Trust Wallet", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/b455042a-aa22-46d6-a184-f8facc927111.jpg", scheme: "trust" },
  { name: "Glow", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/73258f0a-acb8-4924-bd8d-69ecd6665ba7.jpg", scheme: "glow" },
  { name: "Exodus", icon: "https://pub-27a9c17a84044f52a69f145a498e7e6b.r2.dev/dfe3716f-3681-42a1-b0fd-c99e4569fef9.jpg", scheme: "exodus" },
];

function buildSolanaPayUrl(opts: {
  walletAddress: string;
  amount: number | null;
  token: string;
  label: string;
  reference: string;
  message: string;
}) {
  const { walletAddress, amount, token, label, reference, message } = opts;
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(amount));
  const mint = token === "USDT" ? USDT_MINT : token === "USDC" ? USDC_MINT : null;
  if (mint) params.set("spl-token", mint);
  if (label) params.set("label", label);
  if (reference) params.set("reference", reference);
  if (message) params.set("message", message);
  return `solana:${walletAddress}?${params.toString()}`;
}

function buildWalletUrl(scheme: string, solanaPayUrl: string) {
  // Each wallet has its own deeplink format
  switch (scheme) {
    case "phantom":
      return `https://phantom.app/ul/v1/browse/${encodeURIComponent(solanaPayUrl)}?ref=${encodeURIComponent("https://pay.chatfi.pro")}`;
    case "solflare":
      return `solflare:${solanaPayUrl.replace("solana:", "")}`;
    case "backpack":
      return `backpack://v1/browse/${encodeURIComponent(solanaPayUrl)}`;
    case "okex":
      return `okex://main/wc?uri=${encodeURIComponent(solanaPayUrl)}`;
    case "cbwallet":
      return `cbwallet://dapp?url=${encodeURIComponent(solanaPayUrl)}`;
    case "trust":
      return `trust://open_url?coin_id=501&url=${encodeURIComponent(solanaPayUrl)}`;
    default:
      return solanaPayUrl;
  }
}

const PayButton = ({ paymentId, walletAddress, amount, label, token = "USDC", storeUsername }: PayButtonProps) => {
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [showWallets, setShowWallets] = useState(false);

  const solanaPayUrl = buildSolanaPayUrl({
    walletAddress,
    amount,
    token,
    label,
    reference: paymentId,
    message: "Payment via ChatFi Pay",
  });

  const pollPayment = useCallback(async () => {
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
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-16 h-16 rounded-full bg-[#C7F284]/10 border border-[#C7F284]/30 flex items-center justify-center">
          <Check size={32} className="text-[#C7F284]" />
        </div>
        <p className="text-[#C7F284] text-xl font-bold">Payment Received!</p>
        <p className="text-gray-400 text-sm">Redirecting you back to store...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Main pay button */}
      <button
        onClick={() => setShowWallets(!showWallets)}
        className="w-full bg-[#C7F284] text-black font-bold rounded-xl py-4 text-base hover:opacity-90 transition-all flex items-center justify-center gap-2"
      >
        Select Wallet to Pay {amount ? `${amount} ${token}` : ""}
        <ChevronDown size={18} className={`transition-transform ${showWallets ? 'rotate-180' : ''}`} />
      </button>

      {/* Wallet list */}
      {showWallets && (
        <div className="flex flex-col gap-2 bg-[#0A0A0A] rounded-xl p-3 border border-[#1F1F1F]">
          {WALLETS.map(wallet => (
            <a
              key={wallet.scheme}
              href={buildWalletUrl(wallet.scheme, solanaPayUrl)}
              onClick={() => { setShowWallets(false); setTimeout(() => setPolling(true), 15000); }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#222] transition-all"
            >
              <img
                src={wallet.icon}
                alt={wallet.name}
                width={28}
                height={28}
                className="rounded-lg"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-white text-sm font-semibold">{wallet.name}</span>
              <span className="ml-auto text-gray-500 text-xs">Open →</span>
            </a>
          ))}
          {/* Universal fallback */}
          <a
            href={solanaPayUrl}
            onClick={() => { setShowWallets(false); setTimeout(() => setPolling(true), 15000); }}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#222] transition-all border-t border-[#1F1F1F] mt-1 pt-3"
          >
            <div className="w-7 h-7 rounded-lg bg-[#C7F284]/10 flex items-center justify-center text-[#C7F284] text-xs font-bold">◎</div>
            <span className="text-gray-400 text-sm font-semibold">Other Solana Wallet</span>
            <span className="ml-auto text-gray-500 text-xs">Open →</span>
          </a>
        </div>
      )}

      {polling && (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex items-center gap-2 text-[#C7F284]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-medium">
              Confirming payment{pollCount > 0 ? ` (${pollCount})` : '...'}
            </span>
          </div>
          <p className="text-gray-500 text-xs text-center">Waiting for blockchain confirmation</p>
          <button onClick={() => setPolling(false)} className="text-gray-600 text-xs underline">Cancel</button>
        </div>
      )}

      {!polling && (
        <p className="text-gray-500 text-xs text-center">Choose your Solana wallet app to complete payment</p>
      )}
    </div>
  );
};

export default PayButton;
