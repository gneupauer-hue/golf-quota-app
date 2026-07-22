// Minimal SMS sender using Twilio's HTTP API (no SDK dependency).
// Configured via env vars so it stays dormant until they are set:
//   TWILIO_ACCOUNT_SID  - Twilio Account SID (starts with AC...)
//   TWILIO_AUTH_TOKEN   - Twilio Auth Token
//   TWILIO_FROM_NUMBER  - the Twilio phone number to send from, E.164 (e.g. +15705551234)

export type SendSmsInput = {
  to: string;
  body: string;
};

export function isSmsConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

export async function sendSms(
  input: SendSmsInput,
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    throw new Error("Twilio is not configured.");
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({ To: input.to, From: from, Body: input.body });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`
      },
      body: form.toString()
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SMS send failed (${response.status}): ${body.slice(0, 200)}`);
  }
}
