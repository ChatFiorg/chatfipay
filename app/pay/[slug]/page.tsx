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
      <div className="w-full max-w-md bg-[#141414] rounded-3xl overflow-hidden border border-[#2A2A2A]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <span className="text-gray-500 text-[10px] uppercase tracking-[0.12em] font-medium">
            Payment Request
          </span>
          {payment.status !== "completed" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[#C7F284]/20 bg-[#C7F284]/[0.08] text-[#C7F284] text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C7F284] animate-pulse" />
              <ExpiryTimer createdAtMs={createdAtMs} compact />
            </div>
          )}
        </div>

        {payment.status === "completed" ? (
          <div className="text-center py-10 px-5">
            <p className="text-[#C7F284] text-xl font-bold">Already Paid</p>
            <p className="text-gray-500 text-sm mt-1">This payment has been completed.</p>
          </div>
        ) : (
          <>
            {/* Amount block */}
            <div className="px-5 py-5 border-b border-[#2A2A2A]">
              {payment.label && (
                <p className="text-gray-500 text-xs mb-1.5">
                  From <span className="text-gray-200 font-semibold">{payment.label}</span>
                  {payment.memo && <> · {payment.memo}</>}
                </p>
              )}
              {payment.amount && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[42px] font-bold tracking-tight leading-none text-white">
                    {payment.amount}
                  </span>
                  <span className="text-sm font-semibold text-[#C7F284] bg-[#C7F284]/[0.08] border border-[#C7F284]/20 rounded-md px-2 py-0.5">
                    {payment.token}
                  </span>
                </div>
              )}
              <p className="text-gray-600 text-[10px] font-mono mt-1.5">Order #{slug}</p>
            </div>

            {/* Network row */}
            <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-[#2A2A2A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C7F284]" />
              <span className="text-gray-500 text-[11px] font-medium">Solana network only</span>
            </div>

            <div className="px-5 py-5">
              <PayTabs labels={["Wallet App", "Send Manually"]}>
                <div className="flex flex-col gap-4">
                  <QRDisplay
                    link={link}
                    walletAddress={payment.walletAddress}
                    amount={payment.amount}
                    token={payment.token}
                    label={payment.label}
                    paymentId={slug}
                  />
                  <div className="border-t border-[#2A2A2A] pt-4">
                    <PayButton
                      paymentId={slug}
                      walletAddress={payment.walletAddress}
                      amount={payment.amount}
                      label={payment.label}
                      token={payment.token}
                    />
                  </div>
                </div>

                <ManualPay
                  walletAddress={payment.walletAddress}
                  amount={payment.amount}
                  token={payment.token}
                />
              </PayTabs>
            </div>
          </>
        )}

        <p className="text-gray-600 text-xs text-center pb-5">
          Powered by ChatFi Pay · Solana
        </p>
      </div>
    </main>
  );
}
