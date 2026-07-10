"use client";
import React, { useState } from "react";
import PaymentForm from "@/components/checkout/PaymentForm";

export default function Home() {
  const [wallet, setWallet] = useState("");

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
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
            className="bg-[#0A0A0A] text-white border border-[#1F1F1F] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C7F284] transition-all placeholder:text-gray-600"
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
