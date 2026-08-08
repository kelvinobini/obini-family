import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { AuthError, clientIp } from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import { contributorSubmission } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  newStorageKey,
  putObject,
} from "@/lib/storage";

type Ctx = { params: Promise<{ token: string }> };

/**
 * The no-account door.
 *
 * Sent as one multipart request so an elder fills a short form, attaches a
 * photo, taps once, and is done — there is no session to establish, no second
 * upload step, and no password anywhere in the flow. Everything lands in the
 * review queue as unverified.
 */
export const POST = handler(async (req: NextRequest, ctx: Ctx) => {
  const { token } = await ctx.params;
  const ip = clientIp(req.headers) ?? "unknown";

  if (!rateLimit(`contribute:${ip}`, 20, 60 * 60 * 1000).ok) {
    throw new AuthError("That's a lot of submissions at once. Please try later.", 429);
  }

  const link = await db.contributorLink.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!link) throw new AuthError("That link isn't valid.", 401);
  if (link.revokedAt) {
    throw new AuthError(
      `That link was cancelled. Ask ${link.createdByName} for a fresh one.`,
      401
    );
  }
  if (link.usedAt) {
    throw new AuthError(
      `That link has already been used. Ask ${link.createdByName} for a fresh one.`,
      401
    );
  }
  if (link.expiresAt.getTime() <= Date.now()) {
    throw new AuthError(
      `That link has expired. Ask ${link.createdByName} for a fresh one.`,
      401
    );
  }

  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  raw.children = form
    .getAll("children")
    .filter((c): c is string => typeof c === "string" && c.trim() !== "");

  const input = contributorSubmission.parse(raw);

  // The photo, if there is one, rides along attached to the submission and is
  // only moved onto a profile when an admin approves it.
  const photo = form.get("photo");
  const mediaIds: string[] = [];

  const suggestion = await db.suggestion.create({
    data: {
      kind: "NEW_PERSON",
      targetPersonId: link.aboutPersonId,
      payload: {
        person: {
          legalName: input.legalName,
          nativeName: input.nativeName ?? null,
          nickname: input.nickname ?? null,
          gender: input.gender ?? "UNKNOWN",
          birthDateText: input.birthDateText ?? null,
          birthPrecision: "UNKNOWN",
          hometown: input.hometown ?? null,
          lifeStory: input.lifeStory ?? null,
        },
        relatives: [
          input.father ? { name: input.father, relation: "FATHER" } : null,
          input.mother ? { name: input.mother, relation: "MOTHER" } : null,
          input.spouse ? { name: input.spouse, relation: "SPOUSE" } : null,
          ...(input.children ?? []).map((name) => ({ name, relation: "CHILD" })),
        ].filter(Boolean),
        contactEmail: input.contactEmail || null,
      },
      note: input.note ?? null,
      viaLinkId: link.id,
      submitterName: input.legalName,
      submitterEmail: input.contactEmail || null,
      status: "PENDING",
    },
  });

  if (photo && typeof photo !== "string" && photo.size > 0) {
    if (!ALLOWED_UPLOAD_TYPES.PHOTO!.includes(photo.type)) {
      throw new AuthError(
        "That file didn't look like a photo. Try a JPG or PNG.",
        422
      );
    }
    if (photo.size > MAX_UPLOAD_BYTES.PHOTO!) {
      throw new AuthError("That photo is too large. Please try a smaller one.", 422);
    }

    const key = newStorageKey(photo.name || "photo.jpg", "PHOTO");
    await putObject(key, Buffer.from(await photo.arrayBuffer()), photo.type);

    const media = await db.media.create({
      data: {
        kind: "PHOTO",
        storageKey: key,
        mimeType: photo.type,
        sizeBytes: photo.size,
        suggestionId: suggestion.id,
        uploadedByName: input.legalName,
        caption: `Sent by ${input.legalName}`,
      },
    });
    mediaIds.push(media.id);
  }

  // Single use, as promised on the tin.
  await db.contributorLink.update({
    where: { id: link.id },
    data: { usedAt: new Date() },
  });

  await recordAudit({
    actor: { kind: "link", label: link.label },
    action: "CREATE",
    entityType: "Suggestion",
    entityId: suggestion.id,
    entityLabel: input.legalName,
    newValue: { kind: "NEW_PERSON", photos: mediaIds.length },
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  return ok(
    {
      ok: true,
      message:
        `Thank you, ${input.legalName.split(" ")[0]}. ` +
        `${link.createdByName} will look this over and add it to the family record.`,
    },
    201
  );
});
