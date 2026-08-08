/**
 * ---------------------------------------------------------------------------
 * Sample family.
 *
 * Every person, marriage and link created here carries isSeed: true. The app
 * marks them with a "Sample" chip everywhere they appear, and an admin can
 * wipe the whole set in one action from Settings before inviting real
 * relatives. Nothing here is a real Obini.
 *
 * The shape is chosen to exercise the hard cases on day one:
 *   · a remarriage after a death (Nnamdi → Adaeze, then Ifeoma)
 *   · half-siblings from the two marriages (Obiageli vs Chukwuemeka & Ngozi)
 *   · an adoption (Zainab)
 *   · in-laws who married in (Tunde, Amaka)
 *   · a person with no recorded parents (Tunde), which the tree must survive
 *   · fuzzy dates ("about 1931"), because most elders' dates are fuzzy
 * ---------------------------------------------------------------------------
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const db = new PrismaClient();

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

async function main() {
  console.log("Seeding the sample Obini family…");

  await db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // -------------------------------------------------------------------------
  // Generation 1
  // -------------------------------------------------------------------------

  const nnamdi = await person({
    legalName: "Nnamdi Obini",
    nativeName: "Nnamdi Obinna",
    praiseName: "Ọ̀kụ̀kọ̀ na-eje ije",
    nickname: "Papa Nnamdi",
    gender: "MALE",
    titles: ["Ozo Ndu-Eze"],
    birthDate: utc(1931, 4, 12),
    birthPrecision: "APPROX",
    birthDateText: "about 1931, in the rainy season",
    birthPlace: "Umuahia",
    isDeceased: true,
    deathDate: utc(2009, 11, 3),
    deathPrecision: "EXACT",
    deathPlace: "Enugu",
    burialPlace: "Obini family compound, Umuahia",
    hometown: "Umuahia",
    village: "Umuokpara",
    compound: "Obini compound",
    familyHouse: "Ụlọ Obini",
    stateRegion: "Abia State",
    country: "Nigeria",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English"],
    occupation: "Schoolmaster, later a trader",
    religion: "Anglican",
    birthOrder: 1,
    siblingCount: 5,
    lifeStory:
      "Nnamdi taught at the mission school in Umuahia for nineteen years before " +
      "taking over his father's trade. He was known for keeping a ledger of every " +
      "person he lent money to, and for never once asking any of them for it back.",
  });

  const adaeze = await person({
    legalName: "Adaeze Obini",
    nativeName: "Adaeze Nwakaego",
    nickname: "Mama Ada",
    gender: "FEMALE",
    birthDate: utc(1936, 8, 2),
    birthPrecision: "YEAR",
    birthPlace: "Umuahia",
    isDeceased: true,
    deathDate: utc(1979, 2, 17),
    deathPrecision: "EXACT",
    deathPlace: "Umuahia",
    burialPlace: "Obini family compound, Umuahia",
    hometown: "Umuahia",
    ethnicGroup: "Igbo",
    languages: ["Igbo"],
    occupation: "Cloth trader",
    birthOrder: 3,
    siblingCount: 7,
    lifeStory:
      "Adaeze ran a cloth stall at Ubani market from the age of nineteen. She died " +
      "young, and the family still measures the years by whether something happened " +
      "before or after.",
  });

  const ifeoma = await person({
    legalName: "Ifeoma Obini",
    nickname: "Mama Ify",
    gender: "FEMALE",
    birthDate: utc(1948, 1, 22),
    birthPrecision: "EXACT",
    birthPlace: "Aba",
    isDeceased: false,
    hometown: "Aba",
    stateRegion: "Abia State",
    country: "Nigeria",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English"],
    occupation: "Retired nurse",
    religion: "Anglican",
    cityOfResidence: "Enugu",
    phone: "+234 800 000 0001",
    lifeStory:
      "Ifeoma married Nnamdi three years after Adaeze passed, and raised all four " +
      "children as her own. She still keeps the family photographs.",
  });

  // -------------------------------------------------------------------------
  // Generation 2
  // -------------------------------------------------------------------------

  const chukwuemeka = await person({
    legalName: "Chukwuemeka Obini",
    nickname: "Emeka Snr",
    baptismalName: "Peter",
    gender: "MALE",
    birthDate: utc(1962, 6, 30),
    birthPrecision: "EXACT",
    birthPlace: "Umuahia",
    birthOrder: 1,
    siblingCount: 3,
    hometown: "Umuahia",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English"],
    occupation: "Civil engineer",
    education: "University of Nigeria, Nsukka",
    religion: "Anglican",
    cityOfResidence: "Lagos",
    phone: "+234 800 000 0002",
    email: "sample.emeka@example.com",
    lifeStory:
      "The eldest of Nnamdi's children. Moved to Lagos in 1988 and has been " +
      "quietly paying school fees for half the family ever since.",
  });

  const ngozi = await person({
    legalName: "Ngozi Eze",
    nativeName: "Ngozi Obini",
    praiseName: "Nne ọma",
    gender: "FEMALE",
    birthDate: utc(1965, 3, 14),
    birthPrecision: "EXACT",
    birthPlace: "Umuahia",
    birthOrder: 2,
    siblingCount: 3,
    hometown: "Umuahia",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English", "Yoruba"],
    occupation: "Head teacher",
    religion: "Catholic",
    cityOfResidence: "Ibadan",
    whatsapp: "+234 800 000 0003",
    lifeStory:
      "Took her mother's place looking after her younger siblings at fourteen. " +
      "Has taught three generations of children in Ibadan.",
  });

  // Half-sister: Nnamdi's daughter by his second marriage.
  const obiageli = await person({
    legalName: "Obiageli Obini",
    nickname: "Oby",
    gender: "FEMALE",
    birthDate: utc(1984, 9, 9),
    birthPrecision: "EXACT",
    birthPlace: "Enugu",
    birthOrder: 3,
    siblingCount: 3,
    hometown: "Umuahia",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English"],
    occupation: "Pharmacist",
    cityOfResidence: "Enugu",
    lifeStory:
      "Born to Nnamdi and Ifeoma, twenty-two years after her eldest brother. " +
      "Half-sister to Chukwuemeka and Ngozi, and closer to their children in age " +
      "than to them.",
  });

  const tunde = await person({
    legalName: "Tunde Eze",
    gender: "MALE",
    birthDate: utc(1961, 12, 5),
    birthPrecision: "EXACT",
    birthPlace: "Ibadan",
    hometown: "Ibadan",
    stateRegion: "Oyo State",
    country: "Nigeria",
    ethnicGroup: "Yoruba",
    languages: ["Yoruba", "English"],
    occupation: "Accountant",
    religion: "Catholic",
    cityOfResidence: "Ibadan",
    // Deliberately has no recorded parents — the tree has to cope with people
    // who married in and whose own line we have not written down yet.
    lifeStory: "Married Ngozi in 1989. His own family line hasn't been recorded yet.",
  });

  const amaka = await person({
    legalName: "Amaka Obini",
    nativeName: "Amaka Chinwe",
    gender: "FEMALE",
    birthDate: utc(1968, 7, 19),
    birthPrecision: "EXACT",
    birthPlace: "Onitsha",
    hometown: "Onitsha",
    stateRegion: "Anambra State",
    country: "Nigeria",
    ethnicGroup: "Igbo",
    languages: ["Igbo", "English"],
    occupation: "Textile business owner",
    cityOfResidence: "Lagos",
    lifeStory: "Married Chukwuemeka in 1991.",
  });

  // -------------------------------------------------------------------------
  // Generation 3
  // -------------------------------------------------------------------------

  const chidi = await person({
    legalName: "Chidi Obini",
    nickname: "Chidi",
    gender: "MALE",
    birthDate: utc(1993, 5, 21),
    birthPrecision: "EXACT",
    birthPlace: "Lagos",
    birthOrder: 1,
    siblingCount: 2,
    hometown: "Umuahia",
    ethnicGroup: "Igbo",
    languages: ["English", "Igbo"],
    occupation: "Software developer",
    education: "University of Lagos",
    cityOfResidence: "Lagos",
    email: "sample.chidi@example.com",
    phone: "+234 800 000 0004",
    lifeStory: "The one who started putting all of this into a computer.",
  });

  const zainab = await person({
    legalName: "Zainab Obini",
    gender: "FEMALE",
    birthDate: utc(1998, 2, 11),
    birthPrecision: "EXACT",
    birthPlace: "Kano",
    birthOrder: 2,
    siblingCount: 2,
    hometown: "Kano",
    stateRegion: "Kano State",
    country: "Nigeria",
    languages: ["Hausa", "English"],
    occupation: "Doctor",
    cityOfResidence: "Abuja",
    lifeStory:
      "Adopted by Chukwuemeka and Amaka in 2001, and an Obini in every way that " +
      "the family counts.",
  });

  const emekaJnr = await person({
    legalName: "Emeka Eze",
    gender: "MALE",
    birthDate: utc(1991, 10, 2),
    birthPrecision: "EXACT",
    birthPlace: "Ibadan",
    birthOrder: 1,
    siblingCount: 2,
    hometown: "Ibadan",
    ethnicGroup: "Yoruba",
    languages: ["English", "Yoruba", "Igbo"],
    occupation: "Architect",
    cityOfResidence: "Ibadan",
    email: "sample.emekajnr@example.com",
  });

  const kelechi = await person({
    legalName: "Kelechi Eze",
    nickname: "Kel",
    gender: "FEMALE",
    birthDate: utc(1995, 4, 8),
    birthPrecision: "EXACT",
    birthPlace: "Ibadan",
    birthOrder: 2,
    siblingCount: 2,
    hometown: "Ibadan",
    ethnicGroup: "Yoruba",
    languages: ["English", "Yoruba"],
    occupation: "Journalist",
    cityOfResidence: "Lagos",
  });

  // A minor, so the "no contact details for children, ever" rule is testable.
  const chiamaka = await person({
    legalName: "Chiamaka Obini",
    gender: "FEMALE",
    birthDate: utc(2016, 1, 30),
    birthPrecision: "EXACT",
    birthPlace: "Lagos",
    hometown: "Umuahia",
    languages: ["English"],
    lifeStory: "Chidi's daughter. Draws on everything.",
  });

  // -------------------------------------------------------------------------
  // Marriages. Two for Nnamdi: the first ended when Adaeze died.
  // -------------------------------------------------------------------------

  const firstMarriage = await db.union.create({
    data: {
      partnerAId: nnamdi.id,
      partnerBId: adaeze.id,
      type: "MARRIAGE",
      startDate: utc(1959, 12, 26),
      startPrecision: "EXACT",
      place: "Umuahia",
      endDate: utc(1979, 2, 17),
      endReason: "DEATH",
      isCurrent: false,
      householdOrder: 1,
      isSeed: true,
    },
  });

  const secondMarriage = await db.union.create({
    data: {
      partnerAId: nnamdi.id,
      partnerBId: ifeoma.id,
      type: "MARRIAGE",
      startDate: utc(1982, 5, 15),
      startPrecision: "EXACT",
      place: "Enugu",
      isCurrent: true,
      householdOrder: 2,
      notes: "Married three years after Adaeze passed.",
      isSeed: true,
    },
  });

  const ngoziMarriage = await db.union.create({
    data: {
      partnerAId: tunde.id,
      partnerBId: ngozi.id,
      type: "MARRIAGE",
      startDate: utc(1989, 8, 12),
      startPrecision: "EXACT",
      place: "Ibadan",
      isCurrent: true,
      isSeed: true,
    },
  });

  const emekaMarriage = await db.union.create({
    data: {
      partnerAId: chukwuemeka.id,
      partnerBId: amaka.id,
      type: "MARRIAGE",
      startDate: utc(1991, 4, 6),
      startPrecision: "EXACT",
      place: "Onitsha",
      isCurrent: true,
      isSeed: true,
    },
  });

  // -------------------------------------------------------------------------
  // Parent → child edges
  // -------------------------------------------------------------------------

  await parentChild(nnamdi.id, chukwuemeka.id, "BIOLOGICAL", firstMarriage.id);
  await parentChild(adaeze.id, chukwuemeka.id, "BIOLOGICAL", firstMarriage.id);
  await parentChild(nnamdi.id, ngozi.id, "BIOLOGICAL", firstMarriage.id);
  await parentChild(adaeze.id, ngozi.id, "BIOLOGICAL", firstMarriage.id);

  // Half-sister: shares only Nnamdi.
  await parentChild(nnamdi.id, obiageli.id, "BIOLOGICAL", secondMarriage.id);
  await parentChild(ifeoma.id, obiageli.id, "BIOLOGICAL", secondMarriage.id);

  // Ifeoma raised the first marriage's children — a step-parent edge sitting
  // alongside the biological one, not replacing it.
  await parentChild(ifeoma.id, chukwuemeka.id, "STEP", secondMarriage.id);
  await parentChild(ifeoma.id, ngozi.id, "STEP", secondMarriage.id);

  await parentChild(chukwuemeka.id, chidi.id, "BIOLOGICAL", emekaMarriage.id);
  await parentChild(amaka.id, chidi.id, "BIOLOGICAL", emekaMarriage.id);

  // The adoption.
  await parentChild(chukwuemeka.id, zainab.id, "ADOPTIVE", emekaMarriage.id);
  await parentChild(amaka.id, zainab.id, "ADOPTIVE", emekaMarriage.id);

  await parentChild(tunde.id, emekaJnr.id, "BIOLOGICAL", ngoziMarriage.id);
  await parentChild(ngozi.id, emekaJnr.id, "BIOLOGICAL", ngoziMarriage.id);
  await parentChild(tunde.id, kelechi.id, "BIOLOGICAL", ngoziMarriage.id);
  await parentChild(ngozi.id, kelechi.id, "BIOLOGICAL", ngoziMarriage.id);

  await parentChild(chidi.id, chiamaka.id, "BIOLOGICAL", null);

  // -------------------------------------------------------------------------
  // A few stories and milestones so the feed is not empty on first sight.
  // -------------------------------------------------------------------------

  const story = await db.story.create({
    data: {
      title: "The ledger",
      kind: "STORY",
      body:
        "When Papa Nnamdi died we found the ledger in the bottom of his box. " +
        "Forty years of small loans, every one written down in his hand, and not " +
        "one of them marked as repaid. Mama Ify said he never intended them to be.",
      happenedAt: utc(2009, 12, 20),
      authorName: "Chidi Obini",
      isSeed: true,
      tags: { create: [{ personId: nnamdi.id }, { personId: ifeoma.id }] },
    },
  });

  await db.milestone.createMany({
    data: [
      {
        personId: chukwuemeka.id,
        title: "Moved to Lagos",
        description: "Left Umuahia for a post with the state works department.",
        happenedAt: utc(1988, 9, 1),
        place: "Lagos",
        isSeed: true,
      },
      {
        personId: ngozi.id,
        title: "Became head teacher",
        happenedAt: utc(2004, 9, 1),
        place: "Ibadan",
        isSeed: true,
      },
      {
        personId: zainab.id,
        title: "Qualified as a doctor",
        happenedAt: utc(2023, 7, 14),
        place: "Abuja",
        isSeed: true,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // The family's own words for relationships. The calculator shows these next
  // to the English term wherever a code matches.
  // -------------------------------------------------------------------------

  await db.kinshipTerm.createMany({
    data: [
      { code: "FATHER", language: "Igbo", term: "Nna", note: null },
      { code: "MOTHER", language: "Igbo", term: "Nne", note: null },
      { code: "ELDER_BROTHER", language: "Igbo", term: "Dede", note: "Also used for any elder man of the same generation." },
      { code: "ELDER_SISTER", language: "Igbo", term: "Dada", note: null },
      { code: "PATERNAL_GRANDFATHER", language: "Igbo", term: "Nna nna", note: null },
      { code: "MATERNAL_GRANDFATHER", language: "Igbo", term: "Nna nne", note: null },
      { code: "PATERNAL_ELDER_UNCLE", language: "Igbo", term: "Dede nna", note: "Father's elder brother." },
      { code: "PATERNAL_AUNT", language: "Igbo", term: "Ada nna", note: "Father's sister." },
      { code: "WIFE", language: "Igbo", term: "Nwunye", note: null },
      { code: "HUSBAND", language: "Igbo", term: "Di", note: null },
      { code: "CO_WIFE", language: "Igbo", term: "Nwunye di", note: "Wives of the same husband." },
      { code: "SON", language: "Igbo", term: "Nwa nwoke", note: null },
      { code: "DAUGHTER", language: "Igbo", term: "Nwa nwanyi", note: null },
      { code: "FATHER", language: "Yoruba", term: "Bàbá", note: null },
      { code: "MOTHER", language: "Yoruba", term: "Ìyá", note: null },
      { code: "ELDER_BROTHER", language: "Yoruba", term: "Ẹ̀gbọ́n mi", note: "Elder sibling, either sex." },
      { code: "PATERNAL_UNCLE", language: "Yoruba", term: "Bàbá kékeré", note: "Literally 'small father'." },
    ],
    skipDuplicates: true,
  });

  // -------------------------------------------------------------------------
  // Accounts. The primary admin is real; the other two are sample logins for
  // trying the permission rules out.
  // -------------------------------------------------------------------------

  const adminEmail = (process.env.PRIMARY_ADMIN_EMAIL || "admin@example.com").toLowerCase();

  await db.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", isPrimaryAdmin: true, status: "ACTIVE" },
    create: {
      email: adminEmail,
      name: process.env.PRIMARY_ADMIN_NAME || "Obini Family Admin",
      role: "ADMIN",
      isPrimaryAdmin: true,
    },
  });

  await db.user.upsert({
    where: { email: "sample.chidi@example.com" },
    update: { personId: chidi.id, role: "MEMBER" },
    create: {
      email: "sample.chidi@example.com",
      name: "Chidi Obini (sample member)",
      role: "MEMBER",
      personId: chidi.id,
    },
  });

  await db.user.upsert({
    where: { email: "sample.kelechi@example.com" },
    update: { personId: kelechi.id, role: "VIEWER" },
    create: {
      email: "sample.kelechi@example.com",
      name: "Kelechi Eze (sample viewer)",
      role: "VIEWER",
      personId: kelechi.id,
    },
  });

  // Chidi is steward of his late grandfather's record — the case where a member
  // maintains someone who will never log in.
  const admin = await db.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const chidiUser = await db.user.findUniqueOrThrow({
    where: { email: "sample.chidi@example.com" },
  });
  await db.stewardship.upsert({
    where: { steward_pair: { userId: chidiUser.id, personId: nnamdi.id } },
    update: {},
    create: {
      userId: chidiUser.id,
      personId: nnamdi.id,
      grantedById: admin.id,
      note: "Looks after his grandfather's record.",
    },
  });

  console.log(`
  Sample family seeded.

    People        13 (three generations)
    Marriages      4 (one remarriage after a death)
    Adoption       1 (Zainab Obini)
    Half-siblings  Obiageli, to Chukwuemeka and Ngozi
    Minor          Chiamaka Obini (contact details hidden from everyone)
    Story          "${story.title}"

  Sign in as:
    ${adminEmail}                 — admin
    sample.chidi@example.com      — member, is Chidi, steward of Nnamdi
    sample.kelechi@example.com    — viewer, read-only

  Codes print to this terminal while EMAIL_DRIVER=console.
  Clear the sample family from Settings → Sample data when you're ready.
  `);
}

// ---------------------------------------------------------------------------

async function person(data: Omit<Prisma.PersonCreateInput, "isSeed">) {
  return db.person.create({ data: { ...data, isSeed: true } });
}

async function parentChild(
  parentId: string,
  childId: string,
  type: "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "FOSTER" | "GUARDIAN",
  unionId: string | null
) {
  return db.parentChild.create({
    data: { parentId, childId, type, unionId, isSeed: true },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
