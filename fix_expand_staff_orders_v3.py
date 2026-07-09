import re

path = "app/api/store/[slug]/staff/orders/route.ts"
with open(path, "r") as f:
    content = f.read()

original = content

pattern = re.compile(
    r"return \{\s*"
    r"id: d\.id,\s*"
    r"items: data\.items \|\| \(data\.productId \? \[\{ productId: data\.productId, productName: data\.productName, quantity: data\.quantity \|\| 1 \}\] : \[\]\),\s*"
    r"buyerName: data\.buyerName \|\| null,\s*"
    r"buyerPhone: data\.buyerPhone \|\| null,\s*"
    r"amount: data\.amount,\s*"
    r"status: data\.status,\s*"
    r"fulfillmentStatus: data\.fulfillmentStatus \|\| null,\s*"
    r"createdAt: data\.createdAt\?\.toDate\?\.\(\)\?\.toISOString\(\) \|\| null,\s*"
    r"paidAt: data\.paidAt\?\.toDate\?\.\(\)\?\.toISOString\(\) \|\| null,\s*"
    r"\};",
    re.DOTALL
)

replacement = """return {
          id: d.id,
          items: data.items || (data.productId ? [{ productId: data.productId, productName: data.productName, quantity: data.quantity || 1 }] : []),
          buyerName: data.buyerName || null,
          buyerPhone: data.buyerPhone || null,
          buyerEmail: data.buyerEmail || null,
          buyerWallet: data.buyerWallet || null,
          buyerDelivery: data.buyerDelivery || null,
          amount: data.amount,
          subtotal: data.subtotal ?? null,
          discountCode: data.discountCode || null,
          discountAmount: data.discountAmount ?? null,
          giftCardCode: data.giftCardCode || null,
          giftCardAmountUsed: data.giftCardAmountUsed ?? null,
          pointsRedeemed: data.pointsRedeemed ?? null,
          loyaltyDiscount: data.loyaltyDiscount ?? null,
          deliveryMethod: data.deliveryMethod || null,
          shippingFee: data.shippingFee ?? null,
          shippingAddress: data.shippingAddress || null,
          shippingStatus: data.shippingStatus || null,
          paymentMethod: data.paymentMethod || null,
          paymentStatus: data.paymentStatus || null,
          paystackRef: data.paystackRef || null,
          status: data.status,
          fulfillmentStatus: data.fulfillmentStatus || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
        };"""

content, n1 = pattern.subn(replacement, content, count=1)
print(f"[1] Order mapping expanded: {n1} replacement(s)")

if content == original:
    print("\nNO CHANGES MADE — pattern did not match. File left untouched.")
else:
    with open(path, "w") as f:
        f.write(content)
    print("\nFile written successfully.")
