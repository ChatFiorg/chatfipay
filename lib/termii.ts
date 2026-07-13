const TERMII_BASE = "https://api.ng.termii.com/api";

export type TermiiBulkSendResult = {
  code: string;
  message_id?: string;
  message: string;
  balance?: number;
};

// Sends one SMS to up to 10,000 recipients in a single Termii API call.
// Uses the "generic" (non-DND) channel, which is Termii's promotional/
// marketing route — appropriate for bulk campaign sends, not OTPs.
export async function sendBulkSms(
  apiKey: string,
  senderId: string,
  recipients: string[],
  message: string
): Promise<TermiiBulkSendResult> {
  const res = await fetch(`${TERMII_BASE}/sms/send/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: recipients,
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.code !== "ok") {
    throw new Error(data.message || `Termii bulk send failed (${res.status})`);
  }
  return data;
}
