/**
 * Transactional email via SMTP (nodemailer). Configured with a single
 * SMTP_URL, e.g.:
 *   smtps://user:pass@smtp.gmail.com:465          (implicit TLS)
 *   smtp://user:pass@smtp.example.com:587         (STARTTLS negotiated)
 * Unconfigured = sendEmail() is a silent no-op; in-app notifications still work.
 *
 * `renderBrandedEmail` wraps any message in the shared Wamiro shell (brand
 * mark, action button, footer) so transactional mail looks consistent.
 */
import type { Transporter } from "nodemailer";

let cached: Transporter | null | undefined;

function smtpUrl(): string | null {
  return process.env.SMTP_URL ?? null;
}

export function mailerConfigured(): boolean {
  return smtpUrl() !== null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export interface BrandedEmail {
  title: string;
  /** Plain-text-ish greeting line. */
  body: string;
  /** Optional call-to-action button. */
  actionLabel?: string;
  actionUrl?: string;
  /** Secondary detail block rendered below the body (e.g. a temp password). */
  detail?: string;
}

/** Shared Wamiro email shell — mark, message, one action, footer. */
export function renderBrandedEmail(e: BrandedEmail): string {
  const action =
    e.actionLabel && e.actionUrl
      ? `<p style="margin:20px 0 0"><a href="${escapeHtml(e.actionUrl)}" style="background:#4f46e5;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block">${escapeHtml(e.actionLabel)}</a></p>`
      : "";
  const detail = e.detail
    ? `<p style="margin:18px 0 0;padding:12px 14px;background:#f1f5f9;border-radius:8px;color:#334155;font-size:13px;font-family:ui-monospace,monospace">${escapeHtml(e.detail)}</p>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:32px 16px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #eef2f7">
      <span style="font-size:15px;font-weight:800;letter-spacing:.12em;color:#4f46e5">WAMIRO</span>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0;font-size:16px;color:#0f172a">${escapeHtml(e.title)}</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:10px 0 0;white-space:pre-line">${escapeHtml(e.body)}</p>
      ${action}
      ${detail}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #eef2f7">
      <p style="margin:0;color:#94a3b8;font-size:11px">You are receiving this email because of activity in your Wamiro workspace.</p>
    </div>
  </div>
</div>`;
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
