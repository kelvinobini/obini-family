import { z } from "zod";

/**
 * Input shapes, validated at the API boundary. Messages are written to be read
 * by a relative, not a developer.
 */

const trimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

const optionalText = trimmed.nullable().optional();

const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

export const genderEnum = z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]);
export const precisionEnum = z.enum(["EXACT", "MONTH", "YEAR", "APPROX", "UNKNOWN"]);
export const roleEnum = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
export const parentTypeEnum = z.enum([
  "BIOLOGICAL",
  "ADOPTIVE",
  "STEP",
  "FOSTER",
  "GUARDIAN",
  "UNKNOWN",
]);
export const unionTypeEnum = z.enum(["MARRIAGE", "CUSTOMARY", "PARTNERSHIP", "UNKNOWN"]);
export const unionEndEnum = z.enum(["DEATH", "DIVORCE", "SEPARATION", "ANNULMENT"]);
export const siblingTypeEnum = z.enum(["FULL", "HALF", "STEP", "ADOPTIVE", "UNKNOWN"]);
export const mediaKindEnum = z.enum(["PHOTO", "AUDIO", "VIDEO", "DOCUMENT"]);
export const fieldVisibilityEnum = z.enum(["EVERYONE", "MEMBERS", "ADMIN_ONLY"]);

export const personInput = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, "Please enter a name.")
    .max(200, "That name is longer than we can store."),
  nativeName: optionalText,
  praiseName: optionalText,
  nickname: optionalText,
  baptismalName: optionalText,

  birthOrder: z.coerce.number().int().min(1).max(50).nullable().optional(),
  siblingCount: z.coerce.number().int().min(1).max(50).nullable().optional(),
  birthOrderName: optionalText,
  titles: z.array(z.string().trim().min(1)).max(20).optional(),

  gender: genderEnum.optional(),

  birthDate: optionalDate,
  birthPrecision: precisionEnum.optional(),
  birthDateText: optionalText,
  birthPlace: optionalText,

  isDeceased: z.coerce.boolean().optional(),
  deathDate: optionalDate,
  deathPrecision: precisionEnum.optional(),
  deathDateText: optionalText,
  deathPlace: optionalText,
  burialPlace: optionalText,

  hometown: optionalText,
  village: optionalText,
  compound: optionalText,
  familyHouse: optionalText,
  stateRegion: optionalText,
  country: optionalText,
  ethnicGroup: optionalText,
  languages: z.array(z.string().trim().min(1)).max(20).optional(),

  occupation: optionalText,
  education: optionalText,
  religion: optionalText,
  lifeStory: z.string().max(50_000).nullable().optional(),

  phone: optionalText,
  email: optionalText,
  whatsapp: optionalText,
  cityOfResidence: optionalText,

  minorOverride: z.coerce.boolean().optional(),
});

export type PersonInput = z.infer<typeof personInput>;

/** Only the subject or an admin may send this. */
export const privacyInput = z.object({
  privacyLevel: z.enum(["NORMAL", "LIMITED"]).optional(),
  fieldPrivacy: z.record(z.string(), fieldVisibilityEnum).nullable().optional(),
});

export const unionInput = z
  .object({
    partnerAId: z.string().min(1, "Choose the first partner."),
    partnerBId: z.string().min(1, "Choose the second partner."),
    type: unionTypeEnum.optional(),
    startDate: optionalDate,
    startPrecision: precisionEnum.optional(),
    startDateText: optionalText,
    place: optionalText,
    endDate: optionalDate,
    endReason: unionEndEnum.nullable().optional(),
    isCurrent: z.coerce.boolean().optional(),
    householdOrder: z.coerce.number().int().min(1).max(20).nullable().optional(),
    notes: optionalText,
  })
  .refine((v) => v.partnerAId !== v.partnerBId, {
    message: "A person can't be married to themselves.",
    path: ["partnerBId"],
  });

export const parentChildInput = z
  .object({
    parentId: z.string().min(1, "Choose the parent."),
    childId: z.string().min(1, "Choose the child."),
    type: parentTypeEnum.optional(),
    unionId: z.string().nullable().optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    notes: optionalText,
  })
  .refine((v) => v.parentId !== v.childId, {
    message: "A person can't be their own parent.",
    path: ["childId"],
  });

export const siblingInput = z
  .object({
    aId: z.string().min(1),
    bId: z.string().min(1),
    type: siblingTypeEnum.optional(),
    notes: optionalText,
  })
  .refine((v) => v.aId !== v.bId, {
    message: "A person can't be their own sibling.",
    path: ["bId"],
  });

export const suggestionInput = z.object({
  kind: z.enum([
    "FIELD_EDIT",
    "NEW_PERSON",
    "NEW_RELATIONSHIP",
    "MEDIA",
    "DELETE_REQUEST",
    "REMOVAL_REQUEST",
  ]),
  targetPersonId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const reviewInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().trim().max(2000).nullable().optional(),
});

export const inviteInput = z
  .object({
    email: z.string().trim().email("That email doesn't look right.").nullable().optional(),
    phone: optionalText,
    name: optionalText,
    role: roleEnum.default("MEMBER"),
    personId: z.string().nullable().optional(),
    message: z.string().trim().max(1000).nullable().optional(),
    expiresInDays: z.coerce.number().int().min(1).max(90).optional(),
  })
  .refine((v) => !!v.email || !!v.phone, {
    message: "Enter an email address or a phone number.",
    path: ["email"],
  });

export const contributorLinkInput = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the link a name so you know whose it is.")
    .max(120),
  aboutPersonId: z.string().nullable().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(90).optional(),
  sendToEmail: z.string().trim().email().nullable().optional(),
});

/**
 * The no-login form. Six fields on the first screen, everything else optional.
 * Deliberately narrow: a contributor describes themselves and their immediate
 * family, and nothing they send goes live unreviewed.
 */
export const contributorSubmission = z.object({
  legalName: z.string().trim().min(1, "Please tell us your name."),
  nativeName: optionalText,
  nickname: optionalText,
  gender: genderEnum.optional(),
  birthDateText: optionalText,
  hometown: optionalText,
  lifeStory: z.string().trim().max(20_000).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional().or(z.literal("")),

  father: z.string().trim().max(200).nullable().optional(),
  mother: z.string().trim().max(200).nullable().optional(),
  spouse: z.string().trim().max(200).nullable().optional(),
  children: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const signInRequest = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter the email address your family invitation was sent to."),
});

export const signInVerify = z.object({
  identifier: z.string().trim().min(3),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "The code is six digits."),
});

export const storyInput = z.object({
  title: z.string().trim().min(1, "Give the story a title.").max(200),
  body: z.string().max(50_000).nullable().optional(),
  kind: z.enum(["STORY", "MILESTONE", "TRIBUTE"]).optional(),
  happenedAt: optionalDate,
  happenedText: optionalText,
  personIds: z.array(z.string()).max(50).optional(),
  eventId: z.string().nullable().optional(),
});

export const commentInput = z
  .object({
    body: z.string().trim().min(1, "Write something first.").max(5000),
    storyId: z.string().nullable().optional(),
    mediaId: z.string().nullable().optional(),
  })
  .refine((v) => !!v.storyId || !!v.mediaId, {
    message: "A comment has to belong to a story or a photo.",
    path: ["storyId"],
  });

export const milestoneInput = z.object({
  personId: z.string().min(1),
  title: z.string().trim().min(1, "What happened?").max(200),
  description: z.string().max(5000).nullable().optional(),
  happenedAt: optionalDate,
  happenedText: optionalText,
  place: optionalText,
});

export const settingsInput = z.object({
  familyName: z.string().trim().min(1).max(120).optional(),
  longName: z.string().trim().min(1).max(200).optional(),
  contributorLinkDays: z.coerce.number().int().min(1).max(90).optional(),
  invitationDays: z.coerce.number().int().min(1).max(365).optional(),
  hideLivingContactFromViewers: z.coerce.boolean().optional(),
  hideLivingExactDatesFromViewers: z.coerce.boolean().optional(),
  hideLivingContactFromContributors: z.coerce.boolean().optional(),
  allowMemberContributorLinks: z.coerce.boolean().optional(),
  softDeleteWindowDays: z.coerce.number().int().min(1).max(365).optional(),
  birthdayRemindersEnabled: z.coerce.boolean().optional(),
  remembranceRemindersEnabled: z.coerce.boolean().optional(),
});
