import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import ReviewQueue, { type QueueItem } from "./ReviewQueue";

export const metadata: Metadata = { title: "Suggestions" };
export const dynamic = "force-dynamic";

/** Field names as the family would say them, not as the database spells them. */
const FIELD_LABELS: Record<string, string> = {
  legalName: "Full name",
  nativeName: "Native name",
  praiseName: "Praise name (oríkì)",
  nickname: "Known as",
  baptismalName: "Baptismal name",
  birthDate: "Date of birth",
  birthDateText: "When they were born",
  birthPlace: "Place of birth",
  deathDate: "Date they passed",
  deathPlace: "Where they passed",
  burialPlace: "Buried at",
  hometown: "Hometown",
  village: "Village",
  compound: "Compound",
  familyHouse: "Family house",
  stateRegion: "State or region",
  country: "Country",
  ethnicGroup: "Ethnic group",
  occupation: "Occupation",
  education: "Education",
  religion: "Religion",
  lifeStory: "Their story",
  gender: "Gender",
  titles: "Titles",
  languages: "Languages",
};

export default async function ReviewPage() {
  const actor = (await getActor())!;
  if (actor.role !== "ADMIN") redirect("/home");

  const suggestions = await db.suggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      targetPerson: { select: { id: true, legalName: true } },
      submittedBy: { select: { name: true } },
      viaLink: { select: { label: true, createdByName: true } },
      media: { select: { id: true } },
    },
  });

  const items: QueueItem[] = suggestions.map((s) => {
    const payload = (s.payload ?? {}) as Record<string, unknown>;
    // A NEW_PERSON submission nests the person; a FIELD_EDIT is flat.
    const source = (payload.person ?? payload) as Record<string, unknown>;

    const changes = Object.entries(source)
      .filter(([key, value]) => {
        if (key === "relatives" || key === "contactEmail" || key === "kind") return false;
        return value !== null && value !== undefined && value !== "";
      })
      .map(([key, value]) => ({
        label: FIELD_LABELS[key] ?? key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      }));

    // Named relatives ride along on contributor submissions.
    const relatives = (payload.relatives ?? []) as { name: string; relation: string }[];
    for (const r of relatives) {
      if (!r?.name) continue;
      changes.push({ label: RELATION_LABELS[r.relation] ?? r.relation, value: r.name });
    }

    return {
      id: s.id,
      kind: s.kind,
      note: s.note,
      createdAt: s.createdAt.toISOString(),
      targetPerson: s.targetPerson,
      from:
        s.submittedBy?.name ??
        (s.submitterName
          ? `${s.submitterName} (via ${s.viaLink?.createdByName ?? "a link"})`
          : "Someone"),
      fromKind: s.submittedById ? "member" : "contributor",
      changes,
      photos: s.media.length,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Suggestions</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Nothing here has touched the family record yet. It goes in only when
          you say so.
        </p>
      </header>
      <ReviewQueue items={items} />
    </div>
  );
}

const RELATION_LABELS: Record<string, string> = {
  FATHER: "Their father",
  MOTHER: "Their mother",
  SPOUSE: "Their husband or wife",
  CHILD: "Their child",
};
