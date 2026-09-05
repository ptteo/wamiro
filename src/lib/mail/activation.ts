/**
 * Activation emails (Phase A). Fire-and-forget: when SMTP is not configured
 * these are silent no-ops and the caller's UX (e.g. admin-seen temp password)
 * remains the fallback. Never throw into the triggering request.
 */
import { appUrl, mailerConfigured, renderBrandedEmail, sendEmail } from "@/lib/mailer";

/** Sent to a newly invited employee with their one-time temp password. */
export async function sendInviteEmail(input: {
  to: string;
  orgName: string;
  inviterName: string;
  tempPassword: string;
}): Promise<void> {
  if (!mailerConfigured()) return;
  try {
    const loginUrl = `${appUrl()}/login`;
    await sendEmail(
      input.to,
      `You've been added to ${input.orgName} on Wamiro`,
      renderBrandedEmail({
        title: `Welcome to ${input.orgName} 👋`,
        body: `${input.inviterName} added you to your company's Wamiro workspace — the place your team works, asks, and gets help every day.`,
        actionLabel: "Sign in to Wamiro",
        actionUrl: loginUrl,
        detail: `Your temporary password is: ${input.tempPassword}\n\nYou'll be asked to set a new one on your first login.`,
      }),
    );
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "invite_email_failed", err: String(e) }));
  }
}

/** Sent to the registering admin right after their company is provisioned. */
export async function sendWelcomeEmail(input: {
  to: string;
  orgName: string;
  adminName: string;
}): Promise<void> {
  if (!mailerConfigured()) return;
  try {
    const setupUrl = `${appUrl()}/setup`;
    await sendEmail(
      input.to,
      `Welcome to Wamiro — let's set up ${input.orgName}`,
      renderBrandedEmail({
        title: `Welcome, ${input.adminName}!`,
        body: `Your Wamiro workspace for ${input.orgName} is live. Three quick steps — add your logo, invite your team, and post a welcome note — and you're ready for your first day.`,
        actionLabel: "Finish setup (2 minutes)",
        actionUrl: setupUrl,
      }),
    );
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "welcome_email_failed", err: String(e) }));
  }
}
