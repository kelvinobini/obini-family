import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { signInRequest } from "@/lib/validation";
import { hashToken, numericCode, randomToken, minutesFromNow } from "@/lib/tokens";
import { sendEmail, signInEmail } from "@/lib/mail";
import { appUrl } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";

/**
 * Step one of signing in: send a six-digit code and a tap-through link.
 *
 * There is no sign-up here and never will be. If the identifier does not
 * belong to an existing account, nothing is sent — but the response is the
 * same either way, so this endpoint cannot be used to discover who is in the
 * family.
 */
export const POST = handler(async (req: NextRequest) => {
  const { identifier } = signInRequest.parse(await req.json());
  const ip = clientIp(req.headers) ?? "unknown";

  const byIp = rateLimit(`signin:ip:${ip}`, 12, 15 * 60 * 1000);
  const byId = rateLimit(`signin:id:${identifier.toLowerCase()}`, 5, 15 * 60 * 1000);
  if (!byIp.ok || !byId.ok) {
    return ok(
      {
        sent: true,
        message: "Please wait a few minutes before asking for another code.",
      },
      429
    );
  }

  const isEmail = identifier.includes("@");
  const normalised = isEmail ? identifier.toLowerCase() : identifier.replace(/\s/g, "");

  const user = await db.user.findFirst({
    where: isEmail
      ? { email: normalised, deletedAt: null, status: "ACTIVE" }
      : { phone: normalised, deletedAt: null, status: "ACTIVE" },
  });

  const genericResponse = ok({
    sent: true,
    message:
      "If that's a family account, a code is on its way. It expires in 15 minutes.",
  });

  if (!user) return genericResponse;

  const code = numericCode(6);
  const linkToken = randomToken(32);

  // Any earlier codes for this person stop working the moment a new one is sent.
  await db.loginToken.updateMany({
    where: {
      OR: [{ email: isEmail ? normalised : undefined }, { phone: isEmail ? undefined : normalised }],
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  await db.loginToken.create({
    data: {
      email: isEmail ? normalised : null,
      phone: isEmail ? null : normalised,
      codeHash: hashToken(code),
      linkHash: hashToken(linkToken),
      purpose: "SIGN_IN",
      expiresAt: minutesFromNow(15),
      ip,
    },
  });

  if (user.email) {
    const link = appUrl(`/signin/link?token=${linkToken}`);
    await sendEmail({ to: user.email, ...signInEmail(code, link) });
  } else {
    // No SMS provider is wired up. Print it so a phone-only account can still
    // be let in by whoever runs the server.
    console.log(
      `[obini] Sign-in code for ${user.phone}: ${code} ` +
        `(link: ${appUrl(`/signin/link?token=${linkToken}`)})`
    );
  }

  return genericResponse;
});
