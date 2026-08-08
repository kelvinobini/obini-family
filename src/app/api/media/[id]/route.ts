import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { canEditPerson } from "@/lib/authz";
import { verifyMediaToken } from "@/lib/signing";
import { getObject, toBytes } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ---------------------------------------------------------------------------
 * The only route by which a family photo, recording or video ever reaches a
 * browser. Three locks, in order:
 *
 *   1. A valid session. A logged-out request gets 401 and nothing else —
 *      this is what makes "visit an image URL while signed out" reveal nothing.
 *   2. A signature that names this media item AND this user, minted minutes
 *      ago server-side. A URL copied out of the page dies quickly and cannot
 *      be handed to someone else's session.
 *   3. The subject's privacy settings, re-checked here rather than trusted
 *      from whatever page produced the link.
 * ---------------------------------------------------------------------------
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  const deny = (status: number, message: string) =>
    NextResponse.json({ error: message }, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });

  const actor = await getActor();
  if (!actor) return deny(401, "Not signed in");

  const token = req.nextUrl.searchParams.get("t");
  if (!token) return deny(403, "This link is missing its signature.");

  const claim = await verifyMediaToken(token);
  if (!claim || claim.mediaId !== id) {
    return deny(403, "This link has expired. Reload the page to see the photo.");
  }
  if (claim.userId !== actor.id) {
    // Minted for somebody else — a forwarded URL.
    return deny(403, "This link was made for a different account.");
  }

  const media = await db.media.findFirst({
    where: { id, deletedAt: null },
    include: {
      person: {
        select: { id: true, privacyLevel: true, nameOnly: true, deletedAt: true },
      },
    },
  });
  if (!media) return deny(404, "That file is no longer here.");

  // Media still attached to an unapproved submission is admin-only.
  if (media.suggestionId && actor.role !== "ADMIN") {
    return deny(403, "That photo hasn't been approved yet.");
  }

  if (media.person) {
    if (media.person.deletedAt) return deny(404, "That file is no longer here.");
    const isEditor = await canEditPerson(actor, media.person.id);
    const restricted =
      media.person.nameOnly || media.person.privacyLevel === "LIMITED";
    if (restricted && actor.role !== "ADMIN" && !isEditor) {
      return deny(403, "This relative keeps their photos private.");
    }
  }

  const object = await getObject(media.storageKey);
  if (!object) return deny(404, "That file is no longer here.");

  return new NextResponse(toBytes(object.body), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType || object.contentType,
        "Content-Length": String(object.body.byteLength),
        // Private only: never a shared CDN or proxy cache.
        "Cache-Control": "private, max-age=300, no-store",
        "Content-Disposition": `inline; filename="${sanitise(media.caption ?? "photo")}"`,
        "X-Content-Type-Options": "nosniff",
    },
  });
}

function sanitise(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "").slice(0, 80) || "file";
}
