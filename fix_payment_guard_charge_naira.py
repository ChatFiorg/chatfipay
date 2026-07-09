import re

path = "app/api/store/[slug]/charge-naira/route.ts"
with open(path, "r") as f:
    content = f.read()

original = content

pattern = r'(const store = storeSnap\.data\(\)!;\n)'
replacement = (
    r'\1'
    '    const allowedPaymentMethod = store.contact?.paymentMethod || "both";\n'
    '    if (allowedPaymentMethod === "usdc") {\n'
    '      return NextResponse.json({ error: "This store only accepts USDC payments" }, { status: 400 });\n'
    '    }\n'
)
content, n = re.subn(pattern, replacement, content, count=1)
print(f"Guard inserted: {n} replacement(s)")

if content == original:
    print("NO CHANGES MADE — pattern did not match.")
else:
    with open(path, "w") as f:
        f.write(content)
    print("File written successfully.")
