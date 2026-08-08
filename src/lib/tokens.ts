import crypto from "node:crypto";

/**
 * Every token this app hands out (session cookie, invitation link, contributor
 * link, sign-in code) is stored only as a SHA-256 digest. A leaked database
 * dump therefore cannot be replayed as a login.
 */

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Six digits, uniformly distributed, easy to read aloud over the phone. */
export function numericCode(digits = 6): string {
  const max = 10 ** digits;
  let value: number;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= Math.floor(0xffffffff / max) * max); // reject modulo bias
  return String(value % max).padStart(digits, "0");
}

/** Compares without leaking position of the first mismatch via timing. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function isExpired(at: Date | null | undefined): boolean {
  return !at || at.getTime() <= Date.now();
}
