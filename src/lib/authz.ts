import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { AuthError, type Actor } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { Person } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 * The permission model, in one place.
 *
 * Two questions are asked of every write, never one:
 *   1. Does this actor's ROLE permit this kind of action at all?
 *   2. Does this actor's RELATIONSHIP to this specific record permit it?
 *
 * A member passes (1) for "edit a person" and fails (2) for every person who
 * is not themselves or their ward. The UI hides the controls; this file is
 * what actually stops them, and it runs on the server for every mutation.
 * ---------------------------------------------------------------------------
 */

export type Capability =
  // people
  | "person:create"
  | "person:delete"
  | "person:restore"
  | "person:verify"
  // relationships — structural, admin-only, members propose instead
  | "relationship:write"
  // review queue
  | "suggestion:create"
  | "suggestion:review"
  // getting people in
  | "invite:create"
  | "invite:manage"
  | "contributorLink:create"
  | "contributorLink:manage"
  // content
  | "story:create"
  | "comment:create"
  | "album:contribute"
  // administration
  | "audit:view"
  | "audit:rollback"
  | "settings:write"
  | "user:manage"
  | "stewardship:grant"
  | "export:full"
  | "backup:run"
  | "primaryAdmin:transfer";

/** Role-level gate. Question (1). */
export function roleAllows(actor: Actor | null, cap: Capability): boolean {
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt) return false;

  const isAdmin = actor.role === "ADMIN";
  const isMember = actor.role === "MEMBER";

  switch (cap) {
    // Structure of the tree belongs to admins. Members propose.
    case "person:create":
    case "person:delete":
    case "person:restore":
    case "person:verify":
    case "relationship:write":
    case "suggestion:review":
    case "invite:create":
    case "invite:manage":
    case "contributorLink:manage":
    case "audit:view":
    case "audit:rollback":
    case "settings:write":
    case "user:manage":
    case "stewardship:grant":
    case "export:full":
    case "backup:run":
      return isAdmin;

    case "primaryAdmin:transfer":
      return isAdmin && actor.isPrimaryAdmin;

    // Members participate; viewers only read.
    case "suggestion:create":
    case "story:create":
    case "comment:create":
    case "album:contribute":
      return isAdmin || isMember;

    // Settings-dependent, resolved by canCreateContributorLink().
    case "contributorLink:create":
      return isAdmin || isMember;

    default:
      return false;
  }
}

export function assertRole(actor: Actor | null, cap: Capability): asserts actor is Actor {
  if (!actor) throw new AuthError("Not signed in", 401);
  if (!roleAllows(actor, cap)) {
    throw new AuthError(FRIENDLY[cap] ?? "You don't have permission to do that", 403);
  }
}

/** Members may only mint contributor links while the admin allows it. */
export async function canCreateContributorLink(actor: Actor | null): Promise<boolean> {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "MEMBER") return false;
  const settings = await getSettings();
  return settings.allowMemberContributorLinks;
}

// ---------------------------------------------------------------------------
// Question (2): relationship to the specific record.
// ---------------------------------------------------------------------------

/** True when the person is a child by our records, or explicitly flagged one. */
export function isMinor(person: Pick<Person, "birthDate" | "minorOverride" | "isDeceased">): boolean {
  if (person.minorOverride) return true;
  if (person.isDeceased) return false;
  if (!person.birthDate) return false;
  const years =
    (Date.now() - person.birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return years < 18;
}

/**
 * Every person this actor may edit outright, with no review step:
 *   - themselves
 *   - their minor children and wards (guardianship counts)
 *   - deceased relatives an admin has made them steward of
 * Admins get everyone and short-circuit before this is called.
 */
export const editablePersonIds = cache(
  async (actorId: string): Promise<Set<string>> => {
    const actor = await db.user.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, personId: true, status: true, deletedAt: true },
    });
    if (!actor || actor.status !== "ACTIVE" || actor.deletedAt) return new Set();
    if (actor.role === "VIEWER") return new Set();

    const ids = new Set<string>();

    // Themselves.
    if (actor.personId) ids.add(actor.personId);

    // Wards: their own minor children, plus anyone they are guardian of.
    if (actor.personId) {
      const edges = await db.parentChild.findMany({
        where: { parentId: actor.personId, deletedAt: null },
        select: {
          type: true,
          child: {
            select: {
              id: true,
              birthDate: true,
              minorOverride: true,
              isDeceased: true,
              deletedAt: true,
            },
          },
        },
      });
      for (const edge of edges) {
        if (edge.child.deletedAt) continue;
        // A guardian edge is a standing responsibility regardless of age;
        // a parent edge only confers edit rights while the child is a minor.
        if (edge.type === "GUARDIAN" || isMinor(edge.child)) {
          ids.add(edge.child.id);
        }
      }
    }

    // Admin-granted stewardship, typically over a deceased elder.
    const stewardships = await db.stewardship.findMany({
      where: { userId: actorId, revokedAt: null },
      select: { personId: true },
    });
    for (const s of stewardships) ids.add(s.personId);

    return ids;
  }
);

export async function canEditPerson(
  actor: Actor | null,
  personId: string
): Promise<boolean> {
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role === "VIEWER") return false;
  const ids = await editablePersonIds(actor.id);
  return ids.has(personId);
}

/**
 * The 403 the Definition of Done asks for. Called by every route that writes to
 * a Person, before the write, with no UI involvement.
 */
export async function assertCanEditPerson(
  actor: Actor | null,
  personId: string
): Promise<Actor> {
  if (!actor) throw new AuthError("Not signed in", 401);
  if (await canEditPerson(actor, personId)) return actor;
  throw new AuthError(
    "You can only edit your own profile and the people you look after. " +
      "You can suggest a correction to this person instead.",
    403
  );
}

/** Whether the actor is this person, used for self-only settings like privacy. */
export function isSelf(actor: Actor | null, personId: string): boolean {
  return !!actor?.personId && actor.personId === personId;
}

/**
 * Privacy level and per-field privacy are the subject's own call, so only the
 * subject (or an admin) may change them — a steward cannot lock a record down
 * on someone else's behalf.
 */
export function canChangePrivacy(actor: Actor | null, personId: string): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  return isSelf(actor, personId);
}

const FRIENDLY: Partial<Record<Capability, string>> = {
  "person:create": "Only an admin can add a new person. You can suggest one instead.",
  "person:delete": "Only an admin can remove someone from the tree.",
  "relationship:write":
    "Only an admin can change how people are connected. You can suggest a change instead.",
  "suggestion:review": "Only an admin can review suggestions.",
  "invite:create": "Only an admin can invite someone to join.",
  "audit:view": "Only an admin can see the activity log.",
  "audit:rollback": "Only an admin can undo a change.",
  "settings:write": "Only an admin can change family settings.",
  "user:manage": "Only an admin can manage accounts.",
  "export:full": "Only an admin can export the whole family record.",
  "primaryAdmin:transfer": "Only the primary admin can hand over that role.",
  "suggestion:create": "Viewers can browse but can't suggest changes.",
  "story:create": "Viewers can read stories but can't post them.",
  "comment:create": "Viewers can read comments but can't add them.",
};
