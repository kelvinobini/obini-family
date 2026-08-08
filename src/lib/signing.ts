import "server-only";
import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived signatures for media URLs.
 *
 * A signed URL is not a substitute for authentication — /api/media/[id] still
 * demands a valid session and still runs the same privacy checks as the page.
 * The signature is the second lock: it binds the URL to one media item and one
 * viewer for a few minutes, so a copied link goes stale and cannot be pasted
 * into a family WhatsApp group as a permanent public image.
 */

const ISSUER = "obini-family";
const AUDIENCE = "media";

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Generate one with:\n" +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signMediaToken(opts: {
  mediaId: string;
  /** The user the URL is minted for. A different session cannot use it. */
  userId: string;
  ttlSeconds?: number;
}): Promise<string> {
  return new SignJWT({ m: opts.mediaId, u: opts.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? 15 * 60}s`)
    .sign(secret());
}

export async function verifyMediaToken(
  token: string
): Promise<{ mediaId: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.m !== "string" || typeof payload.u !== "string") return null;
    return { mediaId: payload.m, userId: payload.u };
  } catch {
    return null;
  }
}

/** Builds the only URL shape by which a family photo is ever reachable. */
export async function mediaUrl(mediaId: string, userId: string): Promise<string> {
  const token = await signMediaToken({ mediaId, userId });
  return `/api/media/${mediaId}?t=${token}`;
}
