import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * ---------------------------------------------------------------------------
 * Media storage.
 *
 * Non-negotiable in both drivers: the bytes are never reachable by URL. The
 * local driver writes outside the web root; the S3 driver talks to a private
 * bucket with signed server-side requests and never mints a public object URL.
 * The only way to a photo is /api/media/[id], which checks the session first.
 * ---------------------------------------------------------------------------
 */

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

/**
 * A Node Buffer is a Uint8Array over an ArrayBufferLike, which the web `fetch`
 * and `Response` types won't accept as a body. This hands back a view over the
 * same bytes — no copy — with the shape those APIs expect.
 */
export function toBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
}

const driver = () => process.env.STORAGE_DRIVER || "local";

export function newStorageKey(originalName: string, kind: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10) || "";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${kind.toLowerCase()}/${stamp}/${crypto.randomUUID()}${ext}`;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (driver() === "blob") return blobPut(key, body, contentType);
  if (driver() === "s3") return s3Put(key, body, contentType);
  return localPut(key, body);
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (driver() === "blob") return blobGet(key);
  if (driver() === "s3") return s3Get(key);
  return localGet(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (driver() === "blob") return blobDelete(key);
  if (driver() === "s3") return s3Delete(key);
  return localDelete(key);
}

// ---------------------------------------------------------------------------
// Vercel Blob driver — the production path on Vercel, whose filesystem is
// read-only and thrown away on every deploy.
//
// Every blob is written with access: "private", so it has no public URL at
// all. Reads happen server-side with the store's token and the bytes are
// handed to /api/media/[id], which has already checked the session and the
// subject's privacy. A photo of a living relative is never one guessed URL
// away from the open internet.
// ---------------------------------------------------------------------------

async function blobPut(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(key, body, {
    access: "private",
    contentType,
    // Our own key is already a UUID; a second random suffix would mean the
    // stored pathname no longer matches what the database recorded.
    addRandomSuffix: false,
  });
}

async function blobGet(key: string): Promise<StoredObject | null> {
  const { get } = await import("@vercel/blob");
  try {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;

    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    return {
      body: Buffer.concat(chunks),
      contentType: result.blob.contentType || guessContentType(key),
    };
  } catch {
    // A missing blob is a 404 to the caller, not a crash.
    return null;
  }
}

async function blobDelete(key: string): Promise<void> {
  const { del } = await import("@vercel/blob");
  try {
    await del(key);
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Local driver
// ---------------------------------------------------------------------------

function localRoot(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
}

/** Refuses any key that would escape the storage root. */
function localPath(key: string): string {
  const root = localRoot();
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Refusing to touch a path outside the storage directory");
  }
  return full;
}

async function localPut(key: string, body: Buffer): Promise<void> {
  const full = localPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

async function localGet(key: string): Promise<StoredObject | null> {
  try {
    const body = await fs.readFile(localPath(key));
    return { body, contentType: guessContentType(key) };
  } catch {
    return null;
  }
}

async function localDelete(key: string): Promise<void> {
  try {
    await fs.unlink(localPath(key));
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// S3 driver — SigV4 signed, private bucket, no SDK dependency.
// ---------------------------------------------------------------------------

type S3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function s3Config(): S3Config {
  const bucket = required("S3_BUCKET");
  const region = required("S3_REGION");
  const endpoint =
    process.env.S3_ENDPOINT?.replace(/\/$/, "") ||
    `https://${bucket}.s3.${region}.amazonaws.com`;
  return {
    bucket,
    region,
    endpoint,
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set, but STORAGE_DRIVER is "s3"`);
  return v;
}

function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function signedS3Request(
  method: "PUT" | "GET" | "DELETE",
  key: string,
  payload: Buffer,
  contentType?: string
): { url: string; headers: Record<string, string> } {
  const cfg = s3Config();
  const url = new URL(`${cfg.endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders =
    signedHeaderNames.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), "s3"),
    "aws4_request"
  );
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: url.toString(), headers };
}

async function s3Put(key: string, body: Buffer, contentType: string): Promise<void> {
  const { url, headers } = signedS3Request("PUT", key, body, contentType);
  const res = await fetch(url, { method: "PUT", headers, body: toBytes(body) });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  }
}

async function s3Get(key: string): Promise<StoredObject | null> {
  const empty = Buffer.alloc(0);
  const { url, headers } = signedS3Request("GET", key, empty);
  const res = await fetch(url, { method: "GET", headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || guessContentType(key),
  };
}

async function s3Delete(key: string): Promise<void> {
  const empty = Buffer.alloc(0);
  const { url, headers } = signedS3Request("DELETE", key, empty);
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed (${res.status})`);
  }
}

// ---------------------------------------------------------------------------

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
};

export function guessContentType(key: string): string {
  return TYPES[path.extname(key).toLowerCase()] || "application/octet-stream";
}

/** What we are willing to accept from a browser, by media kind. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  PHOTO: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"],
  AUDIO: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "audio/x-m4a"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  DOCUMENT: ["application/pdf"],
};

export const MAX_UPLOAD_BYTES: Record<string, number> = {
  PHOTO: 8 * 1024 * 1024,
  AUDIO: 40 * 1024 * 1024,
  VIDEO: 80 * 1024 * 1024,
  DOCUMENT: 12 * 1024 * 1024,
};
