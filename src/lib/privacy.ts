import type { Person, Settings } from "@prisma/client";
import { isMinor } from "@/lib/authz";

/**
 * ---------------------------------------------------------------------------
 * What each audience is allowed to SEE. Authorization (authz.ts) decides who
 * may write; this decides what comes back on read.
 *
 * Redaction happens on the server before the record is serialised. A field a
 * viewer may not see is never sent to their browser, so there is nothing to
 * find in the network tab.
 * ---------------------------------------------------------------------------
 */

export type Audience =
  /** Admin or co-admin. Sees everything, including limited and deceased records. */
  | "ADMIN"
  /** Can edit this specific record: it is them, their ward, or their stewardship. */
  | "EDITOR"
  /** A signed-in relative. */
  | "MEMBER"
  /** A signed-in relative with read-only access. */
  | "VIEWER"
  /** No account at all — someone holding a contributor link. */
  | "CONTRIBUTOR";

/** Contact detail. Never shown for a minor, to anyone but an admin or guardian. */
const CONTACT_FIELDS = ["phone", "email", "whatsapp", "cityOfResidence"] as const;

/** Present-day location. Heritage places (compound, hometown) are NOT in here —
 *  those are the point of the archive, not a way to find someone's front door. */
const RESIDENCE_FIELDS = ["cityOfResidence"] as const;

/** Everything beyond a name and a place in the tree. */
const DETAIL_FIELDS = [
  "praiseName",
  "nickname",
  "baptismalName",
  "nativeName",
  "birthDate",
  "birthDateText",
  "birthPlace",
  "birthPrecision",
  "deathDate",
  "deathDateText",
  "deathPlace",
  "burialPlace",
  "hometown",
  "village",
  "compound",
  "familyHouse",
  "stateRegion",
  "country",
  "ethnicGroup",
  "languages",
  "occupation",
  "education",
  "religion",
  "lifeStory",
  "titles",
  "birthOrder",
  "siblingCount",
  "birthOrderName",
  ...CONTACT_FIELDS,
] as const;

export type FieldVisibility = "EVERYONE" | "MEMBERS" | "ADMIN_ONLY";

export type RedactedPerson = Partial<Person> &
  Pick<Person, "id" | "legalName" | "isDeceased" | "privacyLevel" | "gender"> & {
    /** Field names withheld from this audience, so the UI can say so honestly
     *  ("Hidden by Ngozi") instead of silently showing a blank. */
    redacted: string[];
    /** True when the record has been reduced to a name by a removal request. */
    nameOnly: boolean;
  };

export function redactPerson(
  person: Person,
  audience: Audience,
  settings: Settings
): RedactedPerson {
  const redacted = new Set<string>();
  const out: Record<string, unknown> = { ...person };

  const hide = (field: string) => {
    if (out[field] === null || out[field] === undefined) return;
    if (Array.isArray(out[field]) && (out[field] as unknown[]).length === 0) return;
    out[field] = Array.isArray(out[field]) ? [] : null;
    redacted.add(field);
  };

  // An admin sees the archive as it truly is; an editor sees the record they
  // are responsible for. Neither is redacted.
  if (audience === "ADMIN" || audience === "EDITOR") {
    return {
      ...(out as Person),
      redacted: [],
      nameOnly: person.nameOnly,
    };
  }

  // 1. Honoured removal request. The node survives so the tree does not break,
  //    and carries nothing but a name.
  if (person.nameOnly) {
    for (const f of DETAIL_FIELDS) hide(f);
    return { ...(out as Person), redacted: [...redacted], nameOnly: true };
  }

  // 2. The subject marked themselves limited: in the tree, by name, and no more.
  if (person.privacyLevel === "LIMITED") {
    for (const f of DETAIL_FIELDS) hide(f);
    return { ...(out as Person), redacted: [...redacted], nameOnly: false };
  }

  const living = !person.isDeceased;
  const minor = isMinor(person);

  // 3. Minors never show contact details to anyone who is not an admin or the
  //    parent/guardian who maintains them — and those two returned above.
  if (minor) {
    for (const f of CONTACT_FIELDS) hide(f);
  }

  // 4. Living-person protection for read-only and no-account audiences.
  const restrictedAudience = audience === "VIEWER" || audience === "CONTRIBUTOR";
  if (living && restrictedAudience) {
    const hideContact =
      audience === "CONTRIBUTOR"
        ? settings.hideLivingContactFromContributors
        : settings.hideLivingContactFromViewers;

    if (hideContact) {
      for (const f of CONTACT_FIELDS) hide(f);
      for (const f of RESIDENCE_FIELDS) hide(f);
    }

    if (settings.hideLivingExactDatesFromViewers && person.birthDate) {
      // Blur rather than erase: the generation still needs to be legible, so
      // keep the year and drop the day and month.
      out.birthDate = new Date(Date.UTC(person.birthDate.getUTCFullYear(), 0, 1));
      out.birthPrecision = "YEAR";
      redacted.add("birthDate:exact");
    }
  }

  // 5. Per-field tightening the subject applied to themselves. This can only
  //    ever make things stricter than the family default.
  const overrides = (person.fieldPrivacy ?? {}) as Record<string, FieldVisibility>;
  for (const [field, level] of Object.entries(overrides)) {
    if (level === "ADMIN_ONLY") hide(field);
    else if (level === "MEMBERS" && audience !== "MEMBER") hide(field);
  }

  return { ...(out as Person), redacted: [...redacted], nameOnly: false };
}

/** Resolves the audience for one specific record. */
export function audienceFor(opts: {
  role: "ADMIN" | "MEMBER" | "VIEWER" | null;
  canEdit: boolean;
}): Audience {
  if (opts.role === "ADMIN") return "ADMIN";
  if (opts.canEdit) return "EDITOR";
  if (opts.role === "MEMBER") return "MEMBER";
  if (opts.role === "VIEWER") return "VIEWER";
  return "CONTRIBUTOR";
}

/** Human sentence for why something is blank, shown next to the empty field. */
export function redactionReason(person: RedactedPerson): string | null {
  if (person.nameOnly) {
    return "This relative asked for their details to be removed. Their place in the family remains.";
  }
  if (person.privacyLevel === "LIMITED") {
    return "This relative has chosen to keep their details private.";
  }
  if (person.redacted.length > 0) {
    return "Some details are hidden to protect living relatives.";
  }
  return null;
}

/** Fields a no-account contributor form is allowed to collect and echo back. */
export const CONTRIBUTOR_FORM_FIELDS = [
  "legalName",
  "nativeName",
  "nickname",
  "gender",
  "birthDateText",
  "hometown",
  "lifeStory",
] as const;
