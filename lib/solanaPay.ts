const TOKEN_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

export function buildSolanaPayUrl(opts: {
  walletAddress: string;
  amount?: number | null;
  token?: string;
  label?: string;
  reference?: string;
  message?: string;
}): string {
  const { walletAddress, amount, token = "SOL", label, reference, message } = opts;
  const base = `solana:${walletAddress}`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(amount));
  const mint = TOKEN_MINTS[token.toUpperCase()];
  if (mint) params.set("spl-token", mint);
  if (label) params.set("label", label);
  if (reference) params.set("reference", reference);
  if (message) params.set("message", message);
  return `${base}?${params.toString()}`;
}
