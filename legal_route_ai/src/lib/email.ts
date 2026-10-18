import "server-only";

export type EmailResult = { delivered: boolean; error?: string };

// Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set; otherwise logs the email to the server console.
export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[email] Not sent (RESEND_API_KEY / EMAIL_FROM not set)\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend error", res.status, body);
      return { delivered: false, error: `Email failed (${res.status})` };
    }
    return { delivered: true };
  } catch (e) {
    console.error("[email] Resend request failed", e);
    return { delivered: false, error: "Email service unreachable" };
  }
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
