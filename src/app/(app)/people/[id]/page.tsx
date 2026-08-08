import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { canEditPerson, isMinor } from "@/lib/authz";
import { audienceFor, redactPerson, redactionReason } from "@/lib/privacy";
import { getSettings } from "@/lib/settings";
import { birthOrderPhrase, formatFamilyDate, lifespan } from "@/lib/dates";
import { mediaUrl } from "@/lib/signing";
import SuggestEdit from "@/components/SuggestEdit";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const person = await db.person.findFirst({
    where: { id, deletedAt: null },
    select: { legalName: true },
  });
  return { title: person?.legalName ?? "Someone in the family" };
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await getActor())!;
  const { id } = await params;

  const raw = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!raw) notFound();

  const settings = await getSettings();
  const canEdit = await canEditPerson(actor, id);
  const audience = audienceFor({ role: actor.role, canEdit });
  const person = redactPerson(raw, audience, settings);
  const minor = isMinor(raw);
  const isSelf = actor.personId === id;

  // Relationships. Deleted people are excluded so a soft-deleted relative does
  // not resurface here.
  const [parentEdges, childEdges, unions, siblingLinks, media, milestones] =
    await Promise.all([
      db.parentChild.findMany({
        where: { childId: id, deletedAt: null },
        include: { parent: { select: { id: true, legalName: true, isDeceased: true } } },
      }),
      db.parentChild.findMany({
        where: { parentId: id, deletedAt: null },
        include: {
          child: {
            select: { id: true, legalName: true, isDeceased: true, birthDate: true },
          },
        },
        orderBy: { child: { birthDate: "asc" } },
      }),
      db.union.findMany({
        where: {
          deletedAt: null,
          OR: [{ partnerAId: id }, { partnerBId: id }],
        },
        include: {
          partnerA: { select: { id: true, legalName: true } },
          partnerB: { select: { id: true, legalName: true } },
        },
        orderBy: [{ householdOrder: "asc" }, { startDate: "asc" }],
      }),
      db.siblingLink.findMany({
        where: { deletedAt: null, OR: [{ aId: id }, { bId: id }] },
        include: {
          a: { select: { id: true, legalName: true } },
          b: { select: { id: true, legalName: true } },
        },
      }),
      db.media.findMany({
        where: { personId: id, deletedAt: null, suggestionId: null },
        orderBy: [{ isProfilePhoto: "desc" }, { approxYear: "asc" }],
        take: 40,
      }),
      db.milestone.findMany({
        where: { personId: id, deletedAt: null },
        orderBy: { happenedAt: "asc" },
      }),
    ]);

  // Siblings by shared parents, plus any asserted directly.
  const parentIds = parentEdges.map((e) => e.parentId);
  const derivedSiblings = parentIds.length
    ? await db.parentChild.findMany({
        where: {
          parentId: { in: parentIds },
          childId: { not: id },
          deletedAt: null,
        },
        include: { child: { select: { id: true, legalName: true, birthDate: true } } },
      })
    : [];

  const siblings = new Map<string, string>();
  for (const s of derivedSiblings) siblings.set(s.child.id, s.child.legalName);
  for (const link of siblingLinks) {
    const other = link.aId === id ? link.b : link.a;
    siblings.set(other.id, other.legalName);
  }

  // Every photo URL is signed for this viewer and expires in minutes.
  const photos = await Promise.all(
    media
      .filter((m) => m.kind === "PHOTO")
      .map(async (m) => ({
        id: m.id,
        url: await mediaUrl(m.id, actor.id),
        caption: m.caption,
        approxYear: m.approxYear,
        isProfile: m.isProfilePhoto,
      }))
  );
  const recordings = await Promise.all(
    media
      .filter((m) => m.kind === "AUDIO" || m.kind === "VIDEO")
      .map(async (m) => ({
        id: m.id,
        url: await mediaUrl(m.id, actor.id),
        kind: m.kind,
        caption: m.caption,
        mimeType: m.mimeType,
      }))
  );

  const cover = photos.find((p) => p.isProfile) ?? photos[0];
  const notice = redactionReason(person);

  return (
    <article className="mx-auto max-w-3xl">
      {raw.isSeed && (
        <p className="mb-4 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-soft)] px-4 py-3 text-[0.92rem] text-[var(--color-ink-soft)]">
          <strong className="text-[var(--color-gold)]">Sample record.</strong> This
          is placeholder data for trying the app out — not a real relative. An
          admin can clear every sample at once from Settings.
        </p>
      )}

      <header className="card mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.url}
              alt={`${person.legalName}`}
              className="h-36 w-36 shrink-0 rounded-2xl border border-[var(--color-paper-3)] object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-paper-3)] bg-[var(--color-paper-2)] font-serif text-4xl text-[var(--color-ink-faint)]"
            >
              {person.legalName.charAt(0)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{person.legalName}</h1>

            <dl className="mt-2 space-y-0.5 text-[0.95rem] text-[var(--color-ink-soft)]">
              {person.nativeName && (
                <NameLine label="Native name" value={person.nativeName} />
              )}
              {person.praiseName && (
                <NameLine label="Praise name (oríkì)" value={person.praiseName} />
              )}
              {person.nickname && <NameLine label="Known as" value={person.nickname} />}
              {person.baptismalName && (
                <NameLine label="Baptismal name" value={person.baptismalName} />
              )}
            </dl>

            <p className="mt-3 text-[var(--color-ink-soft)]">{lifespan(raw)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {raw.isDeceased && (
                <span className="chip bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]">
                  Passed on
                </span>
              )}
              {minor && (
                <span className="chip bg-[var(--color-sage-soft)] text-[var(--color-sage)]">
                  A child — contact details are never shown
                </span>
              )}
              {person.privacyLevel === "LIMITED" && (
                <span className="chip bg-[var(--color-indigo-soft)] text-[var(--color-indigo-deep)]">
                  Keeps details private
                </span>
              )}
              {raw.verification === "VERIFIED" ? (
                <span className="chip bg-[var(--color-sage-soft)] text-[var(--color-sage)]">
                  Confirmed
                </span>
              ) : (
                <span className="chip bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
                  Not yet confirmed
                </span>
              )}
              {(person.titles ?? []).map((t) => (
                <span
                  key={t}
                  className="chip bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--color-paper-3)] bg-[var(--color-paper-2)] px-5 py-3">
          {canEdit ? (
            <>
              <Link href={`/people/${id}/edit`} className="btn btn-primary">
                {isSelf ? "Edit my details" : "Edit this record"}
              </Link>
              {isSelf && (
                <Link href="/me/privacy" className="btn btn-secondary">
                  Privacy settings
                </Link>
              )}
            </>
          ) : (
            /* No edit control at all for someone else's record — and the API
               would refuse it anyway. What a member gets instead is this. */
            <SuggestEdit personId={id} personName={person.legalName} />
          )}
          <Link href={`/relate?to=${id}`} className="btn btn-secondary">
            How am I related?
          </Link>
          <Link href={`/tree?focus=${id}`} className="btn btn-secondary">
            See on the tree
          </Link>
          <Link href={`/print/person/${id}`} className="btn btn-quiet ml-auto">
            Print
          </Link>
        </div>
      </header>

      {notice && (
        <p className="mb-5 rounded-xl border border-[var(--color-paper-3)] bg-white px-4 py-3 text-[0.92rem] text-[var(--color-ink-soft)]">
          {notice}
        </p>
      )}

      <Section title="Family">
        <div className="grid gap-4 sm:grid-cols-2">
          <PeopleList
            label="Parents"
            people={parentEdges.map((e) => ({
              id: e.parent.id,
              name: e.parent.legalName,
              note: e.type === "BIOLOGICAL" ? null : e.type.toLowerCase(),
            }))}
            empty="No parents recorded yet."
          />
          <PeopleList
            label={unions.length > 1 ? "Marriages" : "Marriage"}
            people={unions.map((u) => {
              const other = u.partnerAId === id ? u.partnerB : u.partnerA;
              const ended = !u.isCurrent;
              return {
                id: other.id,
                name: other.legalName,
                note: ended
                  ? u.endReason === "DEATH"
                    ? "until they passed"
                    : "marriage ended"
                  : u.householdOrder
                    ? `${birthOrderPhrase(u.householdOrder, null)?.replace(" child", "")} household`
                    : null,
              };
            })}
            empty="No marriage recorded."
          />
          <PeopleList
            label="Children"
            people={childEdges.map((e) => ({
              id: e.child.id,
              name: e.child.legalName,
              note: e.type === "BIOLOGICAL" ? null : e.type.toLowerCase(),
            }))}
            empty="No children recorded."
          />
          <PeopleList
            label="Brothers and sisters"
            people={[...siblings].map(([sid, name]) => ({ id: sid, name, note: null }))}
            empty="No siblings recorded."
          />
        </div>
      </Section>

      <Section title="Where they come from">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Born" value={formatFamilyDate(person.birthDate ?? null, person.birthPrecision ?? null, person.birthDateText ?? null)} />
          <Fact label="Place of birth" value={person.birthPlace} />
          {raw.isDeceased && (
            <>
              <Fact label="Passed on" value={formatFamilyDate(person.deathDate ?? null, person.deathPrecision ?? null, person.deathDateText ?? null)} />
              <Fact label="Place" value={person.deathPlace} />
              <Fact label="Buried" value={person.burialPlace} />
            </>
          )}
          <Fact
            label="Position in the family"
            value={birthOrderPhrase(person.birthOrder, person.siblingCount)}
          />
          <Fact label="Birth-order name" value={person.birthOrderName} />
          <Fact label="Hometown" value={person.hometown} />
          <Fact label="Village" value={person.village} />
          <Fact label="Compound" value={person.compound} />
          <Fact label="Family house" value={person.familyHouse} />
          <Fact label="State or region" value={person.stateRegion} />
          <Fact label="Country" value={person.country} />
          <Fact label="Ethnic group" value={person.ethnicGroup} />
          <Fact label="Languages" value={(person.languages ?? []).join(", ")} />
          <Fact label="Occupation" value={person.occupation} />
          <Fact label="Education" value={person.education} />
          <Fact label="Religion" value={person.religion} />
        </dl>
      </Section>

      {/* Contact is its own section so it can disappear whole. Minors never
          reach here for anyone but an admin or guardian. */}
      {(person.phone || person.email || person.whatsapp || person.cityOfResidence) && (
        <Section title="Getting in touch">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Fact label="Phone" value={person.phone} />
            <Fact label="WhatsApp" value={person.whatsapp} />
            <Fact label="Email" value={person.email} />
            <Fact label="Lives in" value={person.cityOfResidence} />
          </dl>
        </Section>
      )}

      {person.lifeStory && (
        <Section title="Their story">
          <div className="prose-family whitespace-pre-wrap">{person.lifeStory}</div>
        </Section>
      )}

      {milestones.length > 0 && (
        <Section title="Along the way">
          <ol className="space-y-4">
            {milestones.map((m) => (
              <li key={m.id} className="border-l-2 border-[var(--color-gold)] pl-4">
                <p className="font-semibold">{m.title}</p>
                <p className="text-[0.9rem] text-[var(--color-ink-faint)]">
                  {formatFamilyDate(m.happenedAt, "YEAR", m.happenedText)}
                  {m.place ? ` · ${m.place}` : ""}
                </p>
                {m.description && (
                  <p className="mt-1 text-[var(--color-ink-soft)]">{m.description}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {photos.length > 0 && (
        <Section title="Photographs">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? person.legalName}
                  loading="lazy"
                  className="aspect-square w-full rounded-xl border border-[var(--color-paper-3)] object-cover"
                />
                {(p.caption || p.approxYear) && (
                  <p className="mt-1 text-[0.85rem] text-[var(--color-ink-faint)]">
                    {p.caption}
                    {p.approxYear ? ` · about ${p.approxYear}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recordings.length > 0 && (
        <Section title="In their own voice">
          <ul className="space-y-4">
            {recordings.map((r) => (
              <li key={r.id}>
                {r.caption && <p className="mb-1 font-semibold">{r.caption}</p>}
                {r.kind === "AUDIO" ? (
                  <audio controls preload="none" className="w-full" src={r.url}>
                    Your browser can&apos;t play this recording.
                  </audio>
                ) : (
                  <video controls preload="none" className="w-full rounded-xl" src={r.url}>
                    Your browser can&apos;t play this video.
                  </video>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-6 text-[0.85rem] text-[var(--color-ink-faint)]">
        {raw.lastVerifiedAt
          ? `Last checked ${raw.lastVerifiedAt.toDateString()}.`
          : "Nobody has confirmed these details yet."}
        {!canEdit && " If something here is wrong, you can suggest a correction."}
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-5 p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function NameLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-[var(--color-ink-faint)]">{label}:</dt>
      <dd className="font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function PeopleList({
  label,
  people,
  empty,
}: {
  label: string;
  people: { id: string; name: string; note: string | null }[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </h3>
      {people.length === 0 ? (
        <p className="text-[var(--color-ink-faint)]">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={`${p.id}-${p.note ?? ""}`}>
              <Link
                href={`/people/${p.id}`}
                className="font-medium text-[var(--color-indigo-deep)] underline-offset-2 hover:underline"
              >
                {p.name}
              </Link>
              {p.note && (
                <span className="ml-2 text-[0.85rem] text-[var(--color-ink-faint)]">
                  ({p.note})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
