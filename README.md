# The Obini Family Tree

A private, invitation-only family heritage archive. Not a product — one
family's record of itself: names, relationships, photographs, stories,
hometowns, and the details that disappear when elders pass.

There is no public sign-up, no pricing, no plans, no analytics that send family
data anywhere. Nobody gets an account unless somebody already inside sends them
one.

---

## The permission model

Four roles. The first three have accounts; a contributor does not.

| | Admin | Member | Contributor | Viewer |
|---|---|---|---|---|
| See the family | everything | everything, subject to privacy | nothing | everything, subject to privacy |
| Edit own profile | ✓ | ✓ | — | — |
| Edit minor children / stewarded relatives | ✓ | ✓ | — | — |
| Edit anyone else | ✓ | suggest only | suggest only | — |
| Add or remove people | ✓ | suggest only | suggest only | — |
| Change relationships | ✓ | suggest only | suggest only | — |
| Invite an account | ✓ | — | — | — |
| Mint a contributor link | ✓ | ✓ (admin can disable) | — | — |
| Review the queue | ✓ | — | — | — |
| Activity log and undo | ✓ | — | — | — |

Two decisions worth stating plainly, because they are not the only reasonable
reading of the brief:

- **A member may mint contributor links.** They create no account and grant no
  role, and everything they produce lands unverified in the review queue — so
  this is safe, and it is what stops the admin becoming a bottleneck between an
  elder on WhatsApp and their own history.
- **Relationship changes always go to review, even on your own profile.** A
  relationship is a shared edge: recording "my mother" writes to another
  person's record too. Members get a one-tap "add my parent / add my child"
  form that files the proposal.

### Where it is enforced

`src/lib/authz.ts`. Every write asks two questions — does the actor's *role*
permit this kind of action, and does the actor's *relationship to this record*
permit it. The UI hiding a button is a courtesy; `assertCanEditPerson` is the
control. A member calling `PATCH /api/people/{someone-else}` directly gets a
403 whether or not a browser was involved.

---

## Running it locally

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `DIRECT_URL`
(the same value locally) and `AUTH_SECRET`. Then:

```bash
npm run db:deploy && npm run db:seed && npm run dev
```

Leave `EMAIL_DRIVER=console` — sign-in codes, invitations and contributor links
print to the terminal, so you never need a mail provider to click through the
whole app.

The seed creates thirteen sample relatives across three generations, chosen to
exercise the hard cases: a remarriage after a death, half-siblings from the two
marriages, an adoption, in-laws who married in, a person whose own parents were
never recorded, and a minor. Every seeded row carries `isSeed: true`, shows a
gold **SAMPLE** chip wherever it appears, and can be cleared in one action from
Settings before you invite anyone real.

Sign in as:

| Email | Role |
|---|---|
| whatever you set as `PRIMARY_ADMIN_EMAIL` | admin |
| `sample.chidi@example.com` | member — is Chidi, steward of his late grandfather |
| `sample.kelechi@example.com` | viewer, read-only |

---

## Deploying to Vercel

**1. Push to GitHub** (this repo is already initialised and committed):

```bash
gh auth login
```

```bash
gh repo create obini-family --public --source=. --push
```

**2. Import into Vercel.** New Project → pick the repo. Leave the framework
preset as Next.js. The build command already runs `prisma migrate deploy`, so
the schema is applied on every deploy.

**3. Attach Postgres.** Storage → Neon (or any Postgres). Nothing else to do:
`scripts/build.mjs` works out which connection string is which before Prisma
runs.

That indirection earns its place. Prisma's schema asks for `DATABASE_URL` and
`DIRECT_URL`, and no provider is called that — Neon on Vercel gives
`DATABASE_URL` and `DATABASE_URL_UNPOOLED`, the older Vercel Postgres
integration gives `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`, and a
plain Neon project gives one string and no pooler. Prisma refuses to validate a
schema whose variables are missing, so the mismatch shows up as a bare `P1012`
during build rather than anything that names the real problem. The build script
maps whichever names exist onto the two Prisma wants.

The split itself matters: the app uses the pooled connection because every
request is a fresh serverless invocation and direct connections would exhaust
Postgres' limit, while migrations need the unpooled one because poolers cannot
run DDL.

**4. Attach Blob storage.** Storage → Blob. Vercel injects
`BLOB_READ_WRITE_TOKEN`. Then set `STORAGE_DRIVER=blob`.

Vercel's filesystem is read-only and discarded on every deploy, so the `local`
driver is development-only — uploaded photos would vanish on the next push.
Blobs are written with `access: "private"`, meaning they have no public URL at
all. The app reads them server-side and serves the bytes only through
`/api/media/[id]`, after checking the session.

**5. Set the remaining variables:**

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | your real domain — invitation links are built from it |
| `STORAGE_DRIVER` | `blob` |
| `EMAIL_DRIVER` | `resend` |
| `RESEND_API_KEY` | from resend.com |
| `EMAIL_FROM` | a verified sender on your domain |
| `PRIMARY_ADMIN_EMAIL` | yours |

`EMAIL_DRIVER` must not stay `console` in production. Codes would print to a
server log no relative can read, and nobody would be able to sign in.

**6. Seed once**, against the production database:

```bash
vercel env pull .env.production.local
```

```bash
npm run db:seed
```

---

## Privacy

- No page is indexable: `noindex` both as a header on every route and in the
  document metadata.
- Every route requires a session, including media. Signed out, an image URL
  returns 401 and nothing else.
- Media URLs are signed, name both the file *and* the viewer, and expire in
  fifteen minutes. A link copied into a group chat is dead on arrival and
  useless in someone else's session.
- Contact details, exact birth dates and current city of living people are
  hidden from viewers and from contributor forms by default. Ancestral places —
  hometown, village, compound — stay visible: they are the point of the
  archive, not a way to find somebody's front door.
- Minors never show contact details to anyone but an admin or their guardian.
- Any member can mark themselves **limited**: present in the tree and by name,
  everything else withheld from everyone but an admin.
- A removal request keeps the node as a name only, so the tree does not break
  for everyone else.
- Deletion is soft, with a thirty-day recovery window.

Redaction happens on the server before a record is serialised, so a field a
viewer may not see never reaches their browser at all.

---

## Notes for whoever maintains this next

- **People and relationships are separate tables**, always. `Union`,
  `ParentChild` and `SiblingLink` are what let the schema carry remarriage,
  half-siblings, step-parents, adoption, guardianship and polygynous households
  without a special case for any of them. Putting a `fatherId` column on
  `Person` would break all six.
- **`SiblingLink` exists only for siblings whose shared parent is unrecorded.**
  When the parents are known, siblinghood is derived. The table is for "these
  two are brothers, we just never wrote down their father."
- **The rate limiter in `src/lib/ratelimit.ts` is in-process.** Fine for one
  family on one deployment; it resets on restart and does not coordinate across
  serverless instances. If sign-in abuse ever becomes real, swap the `Map` for
  a shared store — the call sites will not change.
- **The audit log stores one row per changed field**, which is what makes a
  single change individually reversible instead of forcing an all-or-nothing
  restore.
