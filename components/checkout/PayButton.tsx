"use client";
import React, { useState } from "react";

const WALLETS = [
  {
    name: "Phantom",
    logo: "https://i.ibb.co/qNzBBk7/phantom.png",
    deeplink: (solUrl: string) => `https://phantom.app/ul/v1/browse/${encodeURIComponent(solUrl)}?ref=${encodeURIComponent("https://chatfipay-z9xh.vercel.app")}`,
  },
  {
    name: "Solflare",
    logo: "https://i.ibb.co/5nQzxBm/solflare.png",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Backpack",
    logo: "https://play-lh.googleusercontent.com/8P4J-9dPwFmQbJZ04hgL4g0eBNXZBW7mfOWjmNPbXf5nz-1PB0hGzJuGgRiLRNK7A=w240-h480-rw",
    deeplink: (solUrl: string) => `backpack://ul/v1/browse/${encodeURIComponent(solUrl)}`,
  },
  {
    name: "Trust Wallet",
    logo: "https://play-lh.googleusercontent.com/kmFMsNnBRHqCHRlI5k3-5EkVSCiIfNZE2HONqtb-iIIAqMefzEW-5LwzrkmU-Bx5LQ=w240-h480-rw",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Exodus",
    logo: "https://play-lh.googleusercontent.com/SaSJhpfBtyFJrEkeTH7F-2HGnFgfJJMGYbHC5pN2H3yOTgJGX3r5lP7V2AZNOW5kAg=w240-h480-rw",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "OKX Wallet",
    logo: "https://play-lh.googleusercontent.com/fNORM5e_g4wUWGb2n5c8IYdVAqm-_GWvfsBQ2d4X7OC-2bRmvEiEjzJuWxzRQzV8Qw=w240-h480-rw",
    deeplink: (solUrl: string) => `okex://main/wc?uri=${encodeURIComponent(solUrl)}`,
  },
  {
    name: "Coin98",
    logo: "https://play-lh.googleusercontent.com/d5LIEqkXCZGVTVJFiWGYSBnFqzCi2tlgvfhX2ywCkyVFE9t0IqYp8o5nEBDlRzS9-Q=w240-h480-rw",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Glow",
    logo: "https://play-lh.googleusercontent.com/vNSC1DkUEGvz8WB6tICuMHJqTTDklB7HOKRHHGa-JR9JlZgJZKGbP3jFRdXGkCr3pR4=w240-h480-rw",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "Brave Wallet",
    logo: "https://play-lh.googleusercontent.com/6Hf-NWl8mFXLiJDaHgxrzKvVHtItG_MPoYD2vR4bJAApEd6JwbTTOPRt3gL0l3CWBM=w240-h480-rw",
    deeplink: (solUrl: string) => solUrl,
  },
  {
    name: "ChatFi",
    logo: "https://chatfi.pro/logo.png",
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
              {!imgErrors[wallet.name] ? (
                <img
                  src={wallet.logo}
                  alt={wallet.name}
                  width={32}
                  height={32}
                  className="rounded-lg object-cover w-8 h-8"
                  onError={() => setImgErrors(prev => ({ ...prev, [wallet.name]: true }))}
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#2A2A2A] flex items-center justify-center text-xs font-bold text-[#AAFF00]">
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
