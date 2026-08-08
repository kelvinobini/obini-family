/**
 * A small in-process rate limiter, sized for one family on one deployment.
 *
 * It is deliberately not Redis: this app serves tens of people, and an extra
 * piece of infrastructure to keep alive is a worse trade than a counter that
 * resets when the server restarts. If this ever runs on several instances,
 * swap the Map for a shared store — the call sites will not change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Keeps the map from growing without bound on a long-lived server. */
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 10 * 60 * 1000);
  // Do not hold the process open in short-lived serverless invocations.
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
