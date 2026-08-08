import { db } from "@/lib/db";
import type { Settings } from "@prisma/client";

export const DEFAULT_SETTINGS = {
  id: "singleton",
  familyName: "Obini Family",
  longName: "The Obini Family Tree",
  contributorLinkDays: 7,
  invitationDays: 14,
  hideLivingContactFromViewers: true,
  hideLivingExactDatesFromViewers: true,
  hideLivingContactFromContributors: true,
  allowMemberContributorLinks: true,
  softDeleteWindowDays: 30,
  birthdayRemindersEnabled: true,
  remembranceRemindersEnabled: true,
} as const;

/** Reads the single settings row, creating it on first call. */
export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export const APP_NAME = "Obini Family";
export const APP_LONG_NAME = "The Obini Family Tree";

export function appUrl(path = "/"): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
