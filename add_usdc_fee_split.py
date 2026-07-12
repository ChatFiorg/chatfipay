import io

# ---------- app/api/store/[slug]/charge/route.ts ----------
path1 = "app/api/store/[slug]/charge/route.ts"
with io.open(path1, "r", encoding="utf-8") as f:
    src1 = f.read()

replacements1 = [
    (
        "    const ngnPerUsdc = await getNgnPerUsdc();\n"
        "    const amountUsdc = Math.round((finalAmount / ngnPerUsdc) * 100) / 100;\n",
        "    // Buyer covers the on-chain sweep cost (merchant USDC-account rent /\n"
        "    // network fee) as a flat 0.2 USDC surcharge, instead of ChatFi\n"
        "    // absorbing it. Split out again in sweep.ts.\n"
        "    const FEE_USDC = 0.2;\n"
        "    const ngnPerUsdc = await getNgnPerUsdc();\n"
        "    const amountUsdc = Math.round(((finalAmount / ngnPerUsdc) + FEE_USDC) * 100) / 100;\n",
    ),
    (
        "      token: \"USDC\",\n"
        "      label: `${summaryName} x${totalQuantity}`,",
        "      token: \"USDC\",\n"
        "      feeUsdc: FEE_USDC,\n"
        "      label: `${summaryName} x${totalQuantity}`,",
    ),
]

missing1 = []
for old, new in replacements1:
    if old not in src1:
        missing1.append(old[:80])
    else:
        src1 = src1.replace(old, new, 1)

if not missing1:
    with io.open(path1, "w", encoding="utf-8") as f:
        f.write(src1)

# ---------- lib/sweep.ts ----------
path2 = "lib/sweep.ts"
with io.open(path2, "r", encoding="utf-8") as f:
    src2 = f.read()

replacements2 = [
    (
        'const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");\n'
        "// Rent-exemption cost for a new SPL token account (paid by depositKeypair\n"
        "// when creating the merchant's ATA within this same transaction).\n"
        "const ATA_RENT_LAMPORTS = 2_039_280;\n",
        'const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");\n'
        "// Rent-exemption cost for a new SPL token account (paid by depositKeypair\n"
        "// when creating the merchant's ATA within this same transaction).\n"
        "const ATA_RENT_LAMPORTS = 2_039_280;\n"
        "// Flat network-fee surcharge (in USDC base units, 6 decimals) charged to\n"
        "// the buyer at checkout and redirected to treasury here instead of being\n"
        "// sent to the merchant. Keep in sync with FEE_USDC in charge/route.ts.\n"
        "const FEE_USDC_LAMPORTS = BigInt(200_000); // 0.2 USDC\n",
    ),
    (
        "  const merchantPubkey = new PublicKey(merchantWallet);\n"
        "  const fromAta = await getAssociatedTokenAddress(USDC_MINT, depositKeypair.publicKey);\n"
        "  const toAta = await getAssociatedTokenAddress(USDC_MINT, merchantPubkey);\n"
        "\n"
        "  const fromAccount = await getAccount(connection, fromAta).catch(() => null);\n"
        "  if (!fromAccount || fromAccount.amount === BigInt(0)) {\n"
        "    return null;\n"
        "  }\n"
        "\n"
        "  const tx = new Transaction();\n"
        "\n"
        "  const toAccount = await getAccount(connection, toAta).catch(() => null);\n"
        "  const needsAtaCreation = !toAccount;\n"
        "  if (needsAtaCreation) {\n"
        "    tx.add(\n"
        "      createAssociatedTokenAccountInstruction(\n"
        "        depositKeypair.publicKey,\n"
        "        toAta,\n"
        "        merchantPubkey,\n"
        "        USDC_MINT\n"
        "      )\n"
        "    );\n"
        "  }\n"
        "\n"
        "  tx.add(\n"
        "    createTransferInstruction(\n"
        "      fromAta,\n"
        "      toAta,\n"
        "      depositKeypair.publicKey,\n"
        "      fromAccount.amount\n"
        "    )\n"
        "  );\n",
        "  const merchantPubkey = new PublicKey(merchantWallet);\n"
        "  const fromAta = await getAssociatedTokenAddress(USDC_MINT, depositKeypair.publicKey);\n"
        "  const toAta = await getAssociatedTokenAddress(USDC_MINT, merchantPubkey);\n"
        "\n"
        "  const fromAccount = await getAccount(connection, fromAta).catch(() => null);\n"
        "  if (!fromAccount || fromAccount.amount === BigInt(0)) {\n"
        "    return null;\n"
        "  }\n"
        "\n"
        "  const tx = new Transaction();\n"
        "\n"
        "  const toAccount = await getAccount(connection, toAta).catch(() => null);\n"
        "  const needsAtaCreation = !toAccount;\n"
        "  if (needsAtaCreation) {\n"
        "    tx.add(\n"
        "      createAssociatedTokenAccountInstruction(\n"
        "        depositKeypair.publicKey,\n"
        "        toAta,\n"
        "        merchantPubkey,\n"
        "        USDC_MINT\n"
        "      )\n"
        "    );\n"
        "  }\n"
        "\n"
        "  // Split the swept balance: merchant gets the sale amount, treasury\n"
        "  // gets the flat network-fee surcharge the buyer already paid at\n"
        "  // checkout (see FEE_USDC in charge/route.ts). If the balance is\n"
        "  // somehow smaller than the fee (shouldn't happen in practice), skip\n"
        "  // the fee split entirely rather than sending the merchant a negative\n"
        "  // or zero amount.\n"
        "  const treasuryKeyForFee = process.env.TREASURY_PRIVATE_KEY;\n"
        "  let feeAmount = BigInt(0);\n"
        "  let merchantAmount = fromAccount.amount;\n"
        "  let treasuryAta: PublicKey | null = null;\n"
        "\n"
        "  if (treasuryKeyForFee && fromAccount.amount > FEE_USDC_LAMPORTS) {\n"
        "    const treasuryPubkeyForFee = Keypair.fromSecretKey(bs58.decode(treasuryKeyForFee)).publicKey;\n"
        "    treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryPubkeyForFee);\n"
        "    const treasuryAccount = await getAccount(connection, treasuryAta).catch(() => null);\n"
        "    if (!treasuryAccount) {\n"
        "      tx.add(\n"
        "        createAssociatedTokenAccountInstruction(\n"
        "          depositKeypair.publicKey,\n"
        "          treasuryAta,\n"
        "          treasuryPubkeyForFee,\n"
        "          USDC_MINT\n"
        "        )\n"
        "      );\n"
        "    }\n"
        "    feeAmount = FEE_USDC_LAMPORTS;\n"
        "    merchantAmount = fromAccount.amount - FEE_USDC_LAMPORTS;\n"
        "  }\n"
        "\n"
        "  tx.add(\n"
        "    createTransferInstruction(\n"
        "      fromAta,\n"
        "      toAta,\n"
        "      depositKeypair.publicKey,\n"
        "      merchantAmount\n"
        "    )\n"
        "  );\n"
        "\n"
        "  if (feeAmount > BigInt(0) && treasuryAta) {\n"
        "    tx.add(\n"
        "      createTransferInstruction(\n"
        "        fromAta,\n"
        "        treasuryAta,\n"
        "        depositKeypair.publicKey,\n"
        "        feeAmount\n"
        "      )\n"
        "    );\n"
        "  }\n",
    ),
]

missing2 = []
for old, new in replacements2:
    if old not in src2:
        missing2.append(old[:80])
    else:
        src2 = src2.replace(old, new, 1)

if not missing2:
    with io.open(path2, "w", encoding="utf-8") as f:
        f.write(src2)

if missing1 or missing2:
    print("NOT FOUND (check manually):")
    for m in missing1:
        print(" - [charge/route.ts]", m)
    for m in missing2:
        print(" - [sweep.ts]", m)
else:
    print("Fee surcharge + treasury split applied successfully to both files.")
