"use client";
import React, { useState } from "react";
import { markPaymentComplete } from "@/lib/payment";

interface PayButtonProps {
  paymentId: string;
  walletAddress: string;
  amount: number | null;
  label: string;
}

const PayButton = ({ paymentId, walletAddress, amount, label }: PayButtonProps) => {
  const [status, setStatus] = useState<"idle" | "connecting" | "paying" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handlePay = async () => {
    setStatus("connecting");
    setError("");
    try {
      // Build Solana Pay URL
      let url = `solana:${walletAddress}`;
      const params: string[] = [];
      if (amount) params.push(`amount=${amount}`);
      if (label) params.push(`label=${encodeURIComponent(label)}`);
      params.push(`reference=${paymentId}`);
      if (params.length) url += `?${params.join("&")}`;

      // Try to open wallet via deep link
      window.location.href = url;
      setStatus("paying");
    } catch (e) {
      setError("Could not connect wallet. Try scanning the QR code.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="w-full text-center py-4">
        <p className="text-[#AAFF00] font-bold text-lg">Payment Confirmed!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={handlePay}
        disabled={status === "paying" || status === "connecting"}
        className="w-full bg-[#AAFF00] text-black font-bold rounded-xl py-4 text-base hover:bg-[#99ee00] transition-all disabled:opacity-50"
      >
        {status === "connecting" ? "Connecting..." :
         status === "paying" ? "Check your wallet..." :
         `Pay${amount ? ` ${amount} SOL` : ""}`}
      </button>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      <p className="text-gray-500 text-xs text-center">
        Opens your Solana wallet app to confirm payment
      </p>
    </div>
  );
};

export default PayButton;
