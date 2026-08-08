import { APP_LONG_NAME, APP_NAME } from "@/lib/settings";

/**
 * Email delivery. In development EMAIL_DRIVER=console prints the message to the
 * terminal — you can sign in, accept an invitation and open a contributor link
 * without configuring a mail provider at all.
 */

type Message = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(msg: Message): Promise<void> {
  const driver = process.env.EMAIL_DRIVER || "console";

  if (driver === "resend" && process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
    }
    return;
  }

  // Console driver.
  const line = "─".repeat(64);
  console.log(
    `\n${line}\n📧  ${APP_LONG_NAME} — email (console driver)\n` +
      `To:      ${msg.to}\nSubject: ${msg.subject}\n${line}\n${msg.text}\n${line}\n`
  );
}

export function signInEmail(code: string, link: string) {
  return {
    subject: `Your ${APP_NAME} sign-in code: ${code}`,
    text:
      `Welcome back to ${APP_LONG_NAME}.\n\n` +
      `Your sign-in code is:  ${code}\n\n` +
      `Or just tap this link — no password needed:\n${link}\n\n` +
      `The code and the link both stop working in 15 minutes.\n` +
      `If you didn't ask to sign in, you can ignore this message.`,
  };
}

export function invitationEmail(opts: {
  inviterName: string;
  link: string;
  role: string;
  personName?: string | null;
  message?: string | null;
  expiresAt: Date;
}) {
  const roleWord =
    opts.role === "ADMIN"
      ? "an admin"
      : opts.role === "MEMBER"
        ? "a member"
        : "a viewer";
  return {
    subject: `${opts.inviterName} has invited you to ${APP_LONG_NAME}`,
    text:
      `${opts.inviterName} has invited you to join ${APP_LONG_NAME} as ${roleWord}.\n\n` +
      (opts.personName
        ? `You'll land straight on your own page: ${opts.personName}.\n\n`
        : "") +
      (opts.message ? `They wrote:\n"${opts.message}"\n\n` : "") +
      `Tap here to join. There's no password to create:\n${opts.link}\n\n` +
      `This invitation is good until ${opts.expiresAt.toDateString()}.\n\n` +
      `This is a private family archive. Please don't forward this link.`,
  };
}

export function contributorLinkEmail(opts: {
  inviterName: string;
  link: string;
  expiresAt: Date;
}) {
  return {
    subject: `Help us record your details for the ${APP_NAME} tree`,
    text:
      `${opts.inviterName} is putting together ${APP_LONG_NAME} and would love ` +
      `your help filling in your part of it.\n\n` +
      `Tap this link and answer a few short questions. There's no password, ` +
      `no account, and nothing to install:\n${opts.link}\n\n` +
      `The link works until ${opts.expiresAt.toDateString()}, and only once. ` +
      `If it stops working, just ask ${opts.inviterName} for a fresh one.`,
  };
}
