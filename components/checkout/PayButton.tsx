"use client";
import React, { useState } from "react";

const WALLETS = [
  {
    name: "Phantom",
    logo: "/wallets/phantom.png",
    bg: "#AB9FF2",
    fg: "#1A1A1A",
    deeplink: (solUrl: string) => `https://phantom.app/ul/v1/browse/${encodeURIComponent(solUrl)}?ref=${encodeURIComponent("https://chatfipay-z9xh.vercel.app")}`,
  },
  {
    name: "Solflare",
    logo: "/wallets/solflare.png",
    bg: "#FFA900",
    fg: "#1A1A1A",
    deeplink: (solUrl: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(solUrl)}?ref=${encodeURIComponent("https://chatfipay-z9xh.vercel.app")}`,
  },
  {
    name: "Backpack",
    logo: "/wallets/backpack.jpeg",
    bg: "#E33E3E",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => `backpack://ul/v1/browse/${encodeURIComponent(solUrl)}`,
  },
  {
    name: "Trust Wallet",
    logo: "/wallets/trust.jpeg",
    bg: "#3375BB",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Exodus",
    logo: "/wallets/exodus.jpeg",
    bg: "#5A4FCF",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "OKX Wallet",
    logo: "/wallets/okx.png",
    bg: "#FFFFFF",
    fg: "#000000",
    deeplink: (solUrl: string) => `okex://main/wc?uri=${encodeURIComponent(solUrl)}`,
  },
  {
    name: "Coin98",
    logo: "/wallets/coin98.png",
    bg: "#6C5CE7",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Glow",
    logo: "/wallets/glow.jpeg",
    bg: "#B026FF",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Brave Wallet",
    logo: "/wallets/brave.png",
    bg: "#FB542B",
    fg: "#FFFFFF",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "ChatFi",
    logo: null,
    bg: "#AAFF00",
    fg: "#000000",
    deeplink: (solUrl: string) => solUrl,
  },
];

interface PayButtonProps {
  paymentId: string;
  walletAddress: string;
  amount: number | null;
  label: string;
}

const PayButton = ({ paymentId, walletAddress, amount, label }: PayButtonProps) => {
  const [status, setStatus] = useState<"idle" | "picking" | "paying">("idle");
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const buildSolanaUrl = () => {
    const base = `solana:${walletAddress}`;
    const params = new URLSearchParams();
    if (amount) params.set("amount", String(amount));
    if (label) params.set("label", label);
    params.set("reference", paymentId);
    params.set("message", "Payment via ChatFi Pay");
    return `${base}?${params.toString()}`;
  };

  const handleWalletPick = (wallet: typeof WALLETS[0]) => {
    const solanaUrl = buildSolanaUrl();
    const deeplink = wallet.deeplink(solanaUrl);
    setStatus("paying");
    window.location.href = deeplink;
    setTimeout(() => setStatus("idle"), 3000);
  };

  if (status === "picking") {
    return (
      <div className="flex flex-col gap-3 w-full">
        <p className="text-gray-400 text-sm text-center font-semibold">Choose your wallet</p>
        <div className="grid grid-cols-2 gap-2">
          {WALLETS.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => handleWalletPick(wallet)}
              className="flex items-center gap-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-3 hover:border-[#AAFF00] transition-all text-left"
            >
              {wallet.logo && !imgErrors[wallet.name] ? (
                <img
                  src={wallet.logo}
                  alt={wallet.name}
                  width={32}
                  height={32}
                  className="rounded-lg object-cover w-8 h-8 shrink-0"
                  onError={() => setImgErrors(prev => ({ ...prev, [wallet.name]: true }))}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: wallet.bg, color: wallet.fg }}
                >
                  {wallet.name[0]}
                </div>
              )}
              <span className="text-white font-medium text-xs">{wallet.name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setStatus("idle")} className="text-gray-500 text-xs text-center mt-1 hover:text-gray-300">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={() => setStatus("picking")}
        disabled={status === "paying"}
        className="w-full bg-[#AAFF00] text-black font-bold rounded-xl py-4 text-base hover:bg-[#99ee00] transition-all disabled:opacity-50"
      >
        {status === "paying" ? "Opening wallet..." : `Pay${amount ? ` ${amount} SOL` : ""}`}
      </button>
      <p className="text-gray-500 text-xs text-center">Select your Solana wallet to pay</p>
    </div>
  );
};

export default PayButton;
