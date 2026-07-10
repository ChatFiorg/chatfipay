"use client";
import React, { useState } from "react";
import PaymentForm from "@/components/checkout/PaymentForm";

export default function Home() {
  const [wallet, setWallet] = useState("");

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden bg-black">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-40"
      >
        <source src="/videos/hero-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black" />

      <div className="relative z-10 w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-bold">
            ChatFi <span className="text-[#C7F284]">Pay</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Accept Solana payments with a simple link. No signup needed.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400">Your Wallet Address</label>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Enter your Solana wallet address"
            className="bg-[#0A0A0A]/90 backdrop-blur text-white border border-[#1F1F1F] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C7F284] transition-all placeholder:text-gray-600"
          />
        </div>

        {wallet.length > 30 && <PaymentForm walletAddress={wallet} />}

        <p className="text-gray-600 text-xs text-center">
          Powered by ChatFi · Built on Solana
        </p>
      </div>
    </main>
  );
}
