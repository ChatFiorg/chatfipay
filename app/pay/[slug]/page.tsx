import { getPaymentRequest } from "@/lib/payment";
import QRDisplay from "@/components/checkout/QRDisplay";
import PayButton from "@/components/checkout/PayButton";
import PayTabs from "@/components/checkout/PayTabs";
import ManualPay from "@/components/checkout/ManualPay";
import ExpiryTimer from "@/components/checkout/ExpiryTimer";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PayPage({ params }: Props) {
  const { slug } = await params;
  const payment = await getPaymentRequest(slug);
  if (!payment) return notFound();

  const link = `https://pay.chatfi.pro/pay/${slug}`;
  const createdAtMs = payment.createdAt?.toMillis
    ? payment.createdAt.toMillis()
    : Date.now();

  return (
    <main className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#141414] rounded-3xl p-8 flex flex-col gap-5 border border-[#2A2A2A]">

        {/* Header */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-gray-500 text-[11px] uppercase tracking-[0.2em]">
            Payment Request
          </p>
          {payment.label && (
            <h1 className="text-gray-300 text-base font-medium">
              {payment.label}
            </h1>
          )}
          {payment.amount && (
            <p className="text-[#AAFF00] text-5xl font-bold font-mono tabular-nums tracking-tight mt-1">
              {payment.amount} <span className="text-2xl align-top">{(payment as any).token || "SOL"}</span>
            </p>
          )}
          {payment.memo && (
            <p className="text-gray-500 text-sm mt-1">{payment.memo}</p>
          )}
          {payment.status !== "completed" && (
            <div className="mt-2">
              <ExpiryTimer createdAtMs={createdAtMs} />
            </div>
          )}
        </div>

        {payment.status === "completed" ? (
          <div className="text-center py-6">
            <p className="text-[#AAFF00] text-xl font-bold">Already Paid</p>
            <p className="text-gray-500 text-sm mt-1">This payment has been completed.</p>
          </div>
        ) : (
          <PayTabs labels={["Wallet App", "Send Manually"]}>
            {/* Tab 1 - Wallet App */}
            <div className="flex flex-col gap-4">
              <QRDisplay link={link} />
              <div className="border-t border-[#2A2A2A] pt-4">
                <PayButton
                  paymentId={slug}
                  walletAddress={payment.walletAddress}
                  amount={payment.amount}
                  label={payment.label}
                />
              </div>
            </div>

            {/* Tab 2 - Manual Send */}
            <ManualPay
              walletAddress={payment.walletAddress}
              amount={payment.amount}
            />
          </PayTabs>
        )}

        <p className="text-gray-600 text-xs text-center">
          Powered by ChatFi Pay · Solana
        </p>
      </div>
    </main>
  );
}
