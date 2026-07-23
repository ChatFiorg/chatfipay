import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { sendBulkSms } from "@/lib/termii";
import { deductWallet, refundWallet, InsufficientBalanceError, SMS_UNIT_PRICE_NGN } from "@/lib/wallet";

const AT_RISK_DAYS = 60;

type MentionProduct = { id: string; name: string; price: number };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces "#Product Name" with plain-text "Product Name (₦price): <link>" —
// no images/markup since this goes out as an SMS.
function renderMessageWithProductLinks(
  message: string,
  products: MentionProduct[],
  slug: string
): string {
  if (products.length === 0) return message;
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  let result = message;
  for (const p of sorted) {
    const pattern = new RegExp(`#${escapeRegExp(p.name)}`, "gi");
    if (!pattern.test(result)) continue;
    const productUrl = `https://${slug}.chatfi.pro/product/${p.id}`;
    const priceStr = `₦${Number(p.price).toLocaleString()}`;
    result = result.replace(pattern, `${p.name} (${priceStr}): ${productUrl}`);
  }
  return result;
}

function daysSince(date: any): number | null {
  const jsDate = date?.toDate?.();
  if (!jsDate) return null;
  return Math.floor((Date.now() - jsDate.getTime()) / (1000 * 60 * 60 * 24));
}

// POST /api/store/[slug]/campaigns/sms — send a bulk SMS campaign (owner only)
// body: { message, segment: 'all' | 'atRisk' | 'tag', tag? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const message = String(body.message || "").trim();

    const productsSnap = await db.collection("stores").doc(slug).collection("products").get();
    const mentionProducts: MentionProduct[] = productsSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, name: String(data.name || ""), price: Number(data.price || 0) };
    });
    const renderedMessage = renderMessageWithProductLinks(message, mentionProducts, slug);
    const segment: string = body.segment || "all";
    const tag: string | null = body.tag ? String(body.tag).trim() : null;

    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (segment === "tag" && !tag) return NextResponse.json({ error: "Select a tag for this segment" }, { status: 400 });

    const useChatfiCredits = !!body.useChatfiCredits;

    let apiKey: string | null;
    let senderId: string | null;

    if (useChatfiCredits) {
      apiKey = process.env.CHATFI_TERMII_API_KEY || null;
      senderId = process.env.CHATFI_TERMII_SENDER_ID || null;
      if (!apiKey || !senderId) {
        console.error("Missing CHATFI_TERMII_API_KEY or CHATFI_TERMII_SENDER_ID env var");
        return NextResponse.json({ error: "ChatFi-hosted SMS is not configured yet" }, { status: 500 });
      }
    } else {
      const keySnap = await db.collection("storeKeys").doc(slug).get();
      apiKey = keySnap.exists ? keySnap.data()!.termiiApiKey : null;
      if (!apiKey) return NextResponse.json({ error: "No Termii API key on file yet — add one in SMS settings, or use ChatFi credits instead" }, { status: 400 });

      const storeSnap = await db.collection("stores").doc(slug).get();
      senderId = storeSnap.exists ? storeSnap.data()!.sms?.senderId : null;
      if (!senderId) return NextResponse.json({ error: "No Sender ID on file yet — add one in SMS settings" }, { status: 400 });
    }

    const custSnap = await db.collection("stores").doc(slug).collection("customers").get();

    const recipients = custSnap.docs
      .filter(d => !d.id.includes("@")) // phone-keyed docs only; email-keyed customers have no phone
      .filter(d => {
        const data = d.data();
        if (segment === "atRisk") {
          const days = daysSince(data.lastOrderAt);
          return days != null && days >= AT_RISK_DAYS;
        }
        if (segment === "tag") {
          return Array.isArray(data.tags) && data.tags.includes(tag);
        }
        return true; // 'all'
      })
      .map(d => d.id);

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No customers match this segment" }, { status: 400 });
    }

    const totalCost = recipients.length * SMS_UNIT_PRICE_NGN;
    if (useChatfiCredits) {
      try {
        await deductWallet(slug, totalCost);
      } catch (e) {
        if (e instanceof InsufficientBalanceError) {
          return NextResponse.json(
            { error: `Insufficient wallet balance. This send costs ₦${totalCost} (${recipients.length} × ₦${SMS_UNIT_PRICE_NGN}) — top up your wallet to continue.` },
            { status: 402 }
          );
        }
        throw e;
      }
    }

    const now = Timestamp.now();
    const campaignRef = db.collection("stores").doc(slug).collection("campaigns").doc();

    try {
      const result = await sendBulkSms(apiKey, senderId, recipients, renderedMessage);
      await campaignRef.set({
        type: "sms",
        message: renderedMessage,
        segment,
        tag,
        recipientCount: recipients.length,
        status: "sent",
        termiiMessageId: result.message_id || null,
        sentAt: now,
      });
      return NextResponse.json({ success: true, recipientCount: recipients.length, termiiMessageId: result.message_id });
    } catch (e: any) {
      if (useChatfiCredits) {
        await refundWallet(slug, totalCost).catch((refundErr) => console.error("Failed to refund wallet after send failure:", refundErr));
      }
      await campaignRef.set({
        type: "sms",
        message: renderedMessage,
        segment,
        tag,
        recipientCount: recipients.length,
        status: "failed",
        error: e.message || "Send failed",
        sentAt: now,
      });
      return NextResponse.json({ error: e.message || "Failed to send via Termii" }, { status: 502 });
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
