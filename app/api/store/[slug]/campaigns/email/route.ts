import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyStoreAccess } from "@/lib/storeAccess";
import { sendBatchEmails, generateUnsubscribeToken } from "@/lib/emailCampaigns";

const AT_RISK_DAYS = 60;

function daysSince(date: any): number | null {
  const jsDate = date?.toDate?.();
  if (!jsDate) return null;
  return Math.floor((Date.now() - jsDate.getTime()) / (1000 * 60 * 60 * 24));
}

type MentionProduct = { id: string; name: string; price: number; image?: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderBodyWithProductCards(
  bodyText: string,
  products: MentionProduct[],
  slug: string
): string {
  if (products.length === 0) {
    return bodyText
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => `<p style="margin:0 0 14px;color:#333;line-height:1.5">${line}</p>`)
      .join("");
  }

  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);

  return bodyText
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      let html = line;
      for (const p of sorted) {
        const pattern = new RegExp(`#${escapeRegExp(p.name)}`, "gi");
        if (!pattern.test(html)) continue;
        const productUrl = `https://${slug}.chatfi.pro/product/${p.id}`;
        const priceStr = `₦${Number(p.price).toLocaleString()}`;
        const card = `
          <a href="${productUrl}" style="display:block;text-decoration:none;border:1px solid #eee;border-radius:8px;overflow:hidden;margin:12px 0;max-width:320px">
            ${p.image ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:160px;object-fit:cover;display:block" />` : ""}
            <div style="padding:12px">
              <p style="margin:0 0 4px;color:#111;font-weight:bold;font-size:14px">${p.name}</p>
              <p style="margin:0;color:#666;font-size:13px">${priceStr}</p>
            </div>
          </a>`;
        html = html.replace(pattern, card);
      }
      if (html === line) {
        return `<p style="margin:0 0 14px;color:#333;line-height:1.5">${line}</p>`;
      }
      return html;
    })
    .join("");
}

function buildHtml(storeName: string, renderedBody: string, unsubscribeUrl: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
    ${renderedBody}
    <p style="color:#999;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
      You're receiving this because you're a customer of ${storeName}.
      <a href="${unsubscribeUrl}" style="color:#999">Unsubscribe</a>
    </p>
  </div>`;
}

// POST /api/store/[slug]/campaigns/email — send a bulk email campaign (owner only)
// body: { subject, body, segment: 'all' | 'atRisk' | 'tag', tag? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const authorized = await verifyStoreAccess(req, slug);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const subject = String(body.subject || "").trim();
    const bodyText = String(body.body || "").trim();
    const segment: string = body.segment || "all";
    const tag: string | null = body.tag ? String(body.tag).trim() : null;

    if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    if (!bodyText) return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    if (segment === "tag" && !tag) return NextResponse.json({ error: "Select a tag for this segment" }, { status: 400 });

    const storeSnap = await db.collection("stores").doc(slug).get();

    const productsSnap = await db.collection("stores").doc(slug).collection("products").get();
    const mentionProducts: MentionProduct[] = productsSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, name: String(data.name || ""), price: Number(data.price || 0), image: data.image || undefined };
    });
    if (!storeSnap.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const store = storeSnap.data()!;
    const storeName = store.name || slug;
    const replyTo = store.contact?.email || undefined;

    const unsubSnap = await db.collection("stores").doc(slug).collection("emailUnsubscribes").get();
    const unsubscribed = new Set(unsubSnap.docs.map((d) => d.id));

    const custSnap = await db.collection("stores").doc(slug).collection("customers").get();

    const recipients = custSnap.docs
      .map((d) => d.data())
      .filter((c) => c.email && !unsubscribed.has(String(c.email).toLowerCase()))
      .filter((c) => {
        if (segment === "atRisk") {
          const days = daysSince(c.lastOrderAt);
          return days != null && days >= AT_RISK_DAYS;
        }
        if (segment === "tag") {
          return Array.isArray(c.tags) && c.tags.includes(tag);
        }
        return true;
      })
      .map((c) => String(c.email).toLowerCase());

    const uniqueRecipients = Array.from(new Set(recipients));

    if (uniqueRecipients.length === 0) {
      return NextResponse.json({ error: "No customers match this segment" }, { status: 400 });
    }

    const fromAddress = (process.env.RESEND_FROM_EMAIL || "ChatFi <onboarding@resend.dev>").replace(
      /^[^<]*/,
      `${storeName} (via ChatFi) `
    );

    const items = uniqueRecipients.map((email) => {
      const token = generateUnsubscribeToken(slug, email);
      const unsubscribeUrl = `https://pay.chatfi.pro/api/store/${slug}/campaigns/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
      return {
        to: email,
        subject,
        html: buildHtml(storeName, renderBodyWithProductCards(bodyText, mentionProducts, slug), unsubscribeUrl),
        replyTo,
      };
    });

    const now = Timestamp.now();
    const campaignRef = db.collection("stores").doc(slug).collection("campaigns").doc();

    try {
      await sendBatchEmails(items, fromAddress);
      await campaignRef.set({
        type: "email",
        subject,
        message: bodyText,
        segment,
        tag,
        recipientCount: uniqueRecipients.length,
        status: "sent",
        sentAt: now,
      });
      return NextResponse.json({ success: true, recipientCount: uniqueRecipients.length });
    } catch (e: any) {
      await campaignRef.set({
        type: "email",
        subject,
        message: bodyText,
        segment,
        tag,
        recipientCount: uniqueRecipients.length,
        status: "failed",
        error: e.message || "Send failed",
        sentAt: now,
      });
      return NextResponse.json({ error: e.message || "Failed to send via Resend" }, { status: 502 });
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
