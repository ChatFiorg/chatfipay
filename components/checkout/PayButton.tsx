"use client";
import React, { useState, useEffect, useRef } from "react";

interface PayButtonProps {
  paymentId: string;
  walletAddress: string;
  amount: number | null;
  label: string;
}

const PayButton = ({ paymentId, walletAddress, amount, label }: PayButtonProps) => {
  const [status, setStatus] = useState<"idle" | "paying" | "verifying" | "completed" | "error">("idle");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const startPolling = () => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/verify/${paymentId}`);
        const data = await res.json();
        if (data.status === "completed") {
          setStatus("completed");
          stopPolling();
        }
      } catch (e) {
        console.error(e);
      }
      if (attempts >= 20) {
        stopPolling();
        setStatus("error");
      }
    }, 3000);
  };

  const handlePay = () => {
    setStatus("paying");
    const base = `solana:${walletAddress}`;
    const params = new URLSearchParams();
    if (amount) params.set("amount", String(amount));
    if (label) params.set("label", label);
    params.set("reference", paymentId);
    params.set("message", "Payment via ChatFi Pay");
    const url = `${base}?${params.toString()}`;
    window.location.href = url;
    setTimeout(() => {
      setStatus("verifying");
      startPolling();
    }, 3000);
  };

  if (status === "completed") {
    return (
      <div className="w-full text-center py-4 flex flex-col gap-2">
        <p className="text-[#AAFF00] font-bold text-2xl">Payment Confirmed!</p>
        <p className="text-gray-400 text-sm">Transaction verified on Solana</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={handlePay}
        disabled={status === "paying" || status === "verifying"}
        className="w-full bg-[#AAFF00] text-black font-bold rounded-xl py-4 text-base hover:bg-[#99ee00] transition-all disabled:opacity-50"
      >
        {status === "idle" && `Pay${amount ? ` ${amount} SOL` : ""}`}
        {status === "paying" && "Opening wallet..."}
        {status === "verifying" && "Verifying payment..."}
        {status === "error" && "Could not verify — try again"}
      </button>
      {status === "verifying" && (
        <p className="text-gray-500 text-xs text-center animate-pulse">
          Waiting for blockchain confirmation...
        </p>
      )}
      {status === "idle" && (
        <p className="text-gray-500 text-xs text-center">
          Opens your Solana wallet app to confirm payment
        </p>
      )}
    </div>
  );
};

export default PayButton;
