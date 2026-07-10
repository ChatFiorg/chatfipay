"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/shared/Input";
import Button from "@/components/shared/Button";

interface PaymentFormProps {
  walletAddress: string;
}

const PaymentForm = ({ walletAddress }: PaymentFormProps) => {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          amount: amount ? parseFloat(amount) : null,
          token: "USDC",
          label,
          memo,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/pay/${data.id}`);
    } catch (e) {
      setError("Failed to create payment link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <Input
        label="Amount"
        value={amount}
        onChange={setAmount}
        placeholder="0.00"
        type="number"
        hint="Leave empty for any amount"
        suffix={
          <>
            <img
              src="https://store.chatfi.pro/logos/usdc.png"
              alt=""
              className="w-3.5 h-3.5"
            />
            USDC
          </>
        }
      />
      <Input
        label="Label"
        value={label}
        onChange={setLabel}
        placeholder="e.g. Invoice #001"
      />
      <Input
        label="Memo (optional)"
        value={memo}
        onChange={setMemo}
        placeholder="e.g. Payment for design work"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Button
        label={loading ? "Creating..." : "Generate Payment Link"}
        onClick={handleCreate}
        disabled={loading || !walletAddress}
        fullWidth
      />
    </div>
  );
};

export default PaymentForm;
