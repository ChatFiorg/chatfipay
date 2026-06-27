"use client";
import React, { useState } from "react";
import { buildSolanaPayUrl } from "@/lib/solanaPay";

interface PayButtonProps {
  paymentId: string;
  walletAddress: string;
  amount: number | null;
  label: string;
  token?: string;
}

const PayButton = ({ paymentId, walletAddress, amount, label, token = "SOL" }: PayButtonProps) => {
  const [status, setStatus] = useState<"idle" | "paying">("idle");

  const handlePay = () => {
    const url = buildSolanaPayUrl({
      walletAddress,
      amount,
      token,
      label,
      reference: paymentId,
      message: "Payment via ChatFi Pay",
    });
    setStatus("paying");
    window.location.href = url;
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={handlePay}
        disabled={status === "paying"}
        className="w-full bg-[#C7F284] text-black font-bold rounded-xl py-4 text-base hover:opacity-90 transition-all disabled:opacity-50"
      >
        {status === "paying" ? "Opening wallet..." : `Pay${amount ? ` ${amount} ${token}` : ""}`}
      </button>
      <p className="text-gray-500 text-xs text-center">Opens your Solana wallet app to complete payment</p>
    </div>
  );
};

export default PayButton;
