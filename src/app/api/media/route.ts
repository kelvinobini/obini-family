import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor, AuthError, clientIp } from "@/lib/auth";
import { assertCanEditPerson, roleAllows } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  newStorageKey,
  putObject,
} from "@/lib/storage";

/**
 * Upload. Photos onto a person's profile follow that person's edit rules
 * exactly — you can add pictures to your own page, your children's and the
 * elders you look after, and you can add to shared stories and albums.
 * Anything else is a suggestion.
 */
export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    throw new AuthError("No file arrived. Please pick one and try again.", 422);
  }

  const kind = String(form.get("kind") ?? "PHOTO").toUpperCase();
  const allowed = ALLOWED_UPLOAD_TYPES[kind];
  if (!allowed) throw new AuthError("We don't handle that kind of file.", 422);
  if (!allowed.includes(file.type)) {
    throw new AuthError(
      kind === "AUDIO"
        ? "That didn't look like an audio recording."
        : kind === "VIDEO"
          ? "That didn't look like a video."
          : "That didn't look like a photo. Try a JPG or PNG.",
      422
    );
  }
  if (file.size > MAX_UPLOAD_BYTES[kind]!) {
    throw new AuthError(
      "That file is too big. Photos are compressed on your phone before " +
        "sending — if this keeps happening, try a shorter recording.",
      422
    );
  }

  const personId = asId(form.get("personId"));
  const storyId = asId(form.get("storyId"));
  const albumId = asId(form.get("albumId"));

  if (personId) {
    // The same 403 as editing the profile itself.
    await assertCanEditPerson(actor, personId);
  } else if (storyId || albumId) {
    if (!roleAllows(actor, "album:contribute")) {
      throw new AuthError("Viewers can look through the albums but can't add to them.", 403);
    }
  } else {
    throw new AuthError("Tell us who or what this belongs to.", 422);
  }

  const key = newStorageKey(file.name || "upload", kind);
  await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);

  const media = await db.media.create({
    data: {
      kind: kind as "PHOTO" | "AUDIO" | "VIDEO" | "DOCUMENT",
      storageKey: key,
      mimeType: file.type,
      sizeBytes: file.size,
      caption: asText(form.get("caption")),
      approxYear: asYear(form.get("approxYear")),
      durationSec: asNumber(form.get("durationSec")),
      width: asNumber(form.get("width")),
      height: asNumber(form.get("height")),
      personId,
      storyId,
      albumId,
      uploadedById: actor.id,
      uploadedByName: actor.name,
      isProfilePhoto: form.get("isProfilePhoto") === "true",
    },
  });

  // Only one profile photo at a time.
  if (media.isProfilePhoto && personId) {
    await db.media.updateMany({
      where: { personId, isProfilePhoto: true, id: { not: media.id } },
      data: { isProfilePhoto: false },
    });
  }

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "CREATE",
    entityType: "Media",
    entityId: media.id,
    entityLabel: media.caption ?? `${kind.toLowerCase()}`,
    newValue: { kind, personId, storyId },
    ip: clientIp(req.headers),
  });

  return ok({ id: media.id, kind: media.kind }, 201);
});

function asId(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function asText(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 500) : null;
}
function asNumber(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function asYear(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 1000 && n < 2200 ? n : null;
}
