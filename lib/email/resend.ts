// Minimal email sender using Resend's HTTP API (no SDK dependency).
// Configured via env vars so it stays dormant until keys are set:
//   RESEND_API_KEY   - Resend API key
//   NOTIFY_EMAIL_TO  - where owner notifications are sent (e.g. gary@cmgnepa.com)
//   NOTIFY_EMAIL_FROM- optional verified sender; defaults to Resend's onboarding sender

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  from?: string;
};

export function isEmailNotificationConfigured(
  env: Record<string, string | undefined> = process.env
) {
  return Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL_TO);
}

export function getOwnerNotifyAddress(
  env: Record<string, string | undefined> = process.env
) {
  return env.NOTIFY_EMAIL_TO ?? null;
}

export async function sendEmail(
  input: SendEmailInput,
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const from = input.from ?? env.NOTIFY_EMAIL_FROM ?? "Irem Golf <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email send failed (${response.status}): ${body.slice(0, 200)}`);
  }
}
