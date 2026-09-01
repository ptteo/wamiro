/**
 * Transactional email via SMTP (nodemailer). Configured with a single
 * SMTP_URL, e.g.:
 *   smtps://user:pass@smtp.gmail.com:465          (implicit TLS)
 *   smtp://user:pass@smtp.example.com:587         (STARTTLS negotiated)
 * Unconfigured = sendEmail() is a silent no-op; in-app notifications still work.
 */
import type { Transporter } from "nodemailer";

let cached: Transporter | null | undefined;

function smtpUrl(): string | null {
  return process.env.SMTP_URL ?? null;
}

export function mailerConfigured(): boolean {
  return smtpUrl() !== null;
}

async function getTransporter(): Promise<Transporter | null> {
  if (cached !== undefined) return cached;
  const url = smtpUrl();
  if (!url) return (cached = null);
  try {
    const nodemailer = await import("nodemailer");
    cached = nodemailer.createTransport(url);
    return cached;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "mailer_init_failed", err: String(e) }));
    return (cached = null);
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = await getTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? "Wamiro <no-reply@wamiro.local>",
      to,
      subject,
      html,
    });
    return true;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "email_send_failed", to: "**redacted**", err: String(e) }));
    return false;
  }
}
