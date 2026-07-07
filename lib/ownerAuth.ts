import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { normalizeEmail } from "./buyerAuth";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  let padded = input.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64");
}

function getAuthSecret(): string {
  const secret = process.env.BUYER_AUTH_SECRET;
  if (!secret) throw new Error("BUYER_AUTH_SECRET not configured");
  return secret;
}

export type OwnerAuthMethod = "wallet" | "google" | "email";

export interface OwnerTokenPayload {
  ownerId: string; // "wallet:<address>" or "email:<normalized email>"
  method: OwnerAuthMethod;
  iat: number;
  exp: number;
}

// Reuses the buyer/staff signing secret but a distinct payload shape
// (ownerId + method, no permissions/slug), so tokens for different roles
// can never be mistaken for one another at verify time.
export function signOwnerToken(ownerId: string, method: OwnerAuthMethod): string {
  const payload: OwnerTokenPayload = {
    ownerId,
    method,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

export function verifyOwnerToken(token: string | null | undefined): OwnerTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = base64url(
    crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest()
  );
  if (expectedSig !== sigB64) return null;
  try {
    const payload: OwnerTokenPayload = JSON.parse(base64urlDecode(payloadB64).toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.ownerId || !payload.method) return null;
    return payload;
  } catch {
    return null;
  }
}

// Verifies a wallet-signed login message. The client signs a message of the
// form "ChatFi Login\nTimestamp: <ISO>\nWallet: <address>" with their wallet;
// we check the signature is valid for that wallet's public key AND that the
// timestamp is recent, so a captured signature can't be replayed later.
export function verifyWalletSignature(walletAddress: string, message: string, signature: string): boolean {
  try {
    const expectedPrefix = `Wallet: ${walletAddress}`;
    if (!message.includes(expectedPrefix)) return false;

    const timestampMatch = message.match(/Timestamp: (.+)/);
    if (!timestampMatch) return false;
    const ts = new Date(timestampMatch[1]).getTime();
    if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false; // 5 min window

    const publicKey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
  } catch {
    return false;
  }
}

export { normalizeEmail };
