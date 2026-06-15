"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createPaymentRequest } from "@/lib/payment";
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
      const id = await createPaymentRequest(
        walletAddress,
        amount ? parseFloat(amount) : null,
        label,
        memo
      );
      router.push(\`/pay/${id}\`);
    } catch (e) {
      setError("Failed to create payment link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <Input
        label="Amount (SOL)"
        value={amount}
        onChange={setAmount}
        placeholder="0.00"
        type="number"
        hint="Leave empty for any amount"
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
