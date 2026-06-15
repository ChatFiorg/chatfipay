import { getPaymentRequest } from "@/lib/payment";
import QRDisplay from "@/components/checkout/QRDisplay";
import PayButton from "@/components/checkout/PayButton";
import { notFound } from "next/navigation";

interface Props {
  params: { slug: string };
}

export default async function PayPage({ params }: Props) {
  const payment = await getPaymentRequest(params.slug);
  if (!payment) return notFound();

  const link = `https://chatfipay.pro/pay/${params.slug}`;

  return (
    <main className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#141414] rounded-3xl p-8 flex flex-col gap-6 border border-[#2A2A2A]">
        <div className="flex flex-col items-center gap-1">
          <p className="text-gray-400 text-sm">Payment Request</p>
          <h1 className="text-white text-2xl font-bold">
            {payment.label || "Pay Now"}
          </h1>
          {payment.amount && (
            <p className="text-[#AAFF00] text-4xl font-bold mt-1">
              {payment.amount} SOL
            </p>
          )}
          {payment.memo && (
            <p className="text-gray-400 text-sm mt-1">{payment.memo}</p>
          )}
        </div>

        {payment.status === "completed" ? (
          <div className="text-center py-6">
            <p className="text-[#AAFF00] text-xl font-bold">Already Paid</p>
            <p className="text-gray-500 text-sm mt-1">This payment has been completed.</p>
          </div>
        ) : (
          <>
            <QRDisplay
              link={link}
              amount={payment.amount}
              label={payment.label}
            />
            <div className="border-t border-[#2A2A2A] pt-4">
              <PayButton
                paymentId={params.slug}
                walletAddress={payment.walletAddress}
                amount={payment.amount}
                label={payment.label}
              />
            </div>
          </>
        )}

        <p className="text-gray-600 text-xs text-center">
          Powered by ChatFi Pay · Solana
        </p>
      </div>
    </main>
  );
}
