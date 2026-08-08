/**
 * Build entry point.
 *
 * Exists for one reason: hosting providers each invent their own names for the
 * same two Postgres connection strings, and Prisma refuses to even validate a
 * schema when a referenced variable is missing. Attaching Neon on Vercel gives
 * you DATABASE_URL and DATABASE_URL_UNPOOLED; the older Vercel Postgres
 * integration gives POSTGRES_PRISMA_URL and POSTGRES_URL_NON_POOLING; a plain
 * Neon or Supabase project gives you one string and no pooler at all.
 *
 * None of them is called DIRECT_URL, which is what prisma/schema.prisma asks
 * for. So rather than making whoever deploys this hand-copy a value between
 * two boxes in a dashboard — and watch an unhelpful P1012 until they do — we
 * work it out here.
 *
 * Env set in this process is inherited by the children, which is why the three
 * build steps are spawned from here rather than chained with && in a script.
 */

import { execSync } from "node:child_process";

const pick = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return { name, value };
  }
  return null;
};

// The pooled connection the running app uses.
const pooled = pick(
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED"
);

// The unpooled one migrations need — poolers cannot run DDL.
const direct = pick(
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL"
);

if (!pooled || !direct) {
  console.error(
    "\n  No database connection string found.\n\n" +
      "  Set DATABASE_URL, or attach Postgres to this project so one of\n" +
      "  DATABASE_URL / POSTGRES_PRISMA_URL / DATABASE_URL_UNPOOLED exists.\n"
  );
  process.exit(1);
}

/**
 * Migrations must not go through a connection pooler. Prisma takes an advisory
 * lock and issues DDL, and PgBouncer in transaction mode breaks both — usually
 * with a confusing error about prepared statements rather than about pooling.
 *
 * Neon names its pooled host with a "-pooler" suffix and its direct host
 * identically without it, so when the only string we were given is the pooled
 * one we can derive the direct one instead of failing.
 */
function unpool(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("-pooler")) return null;
    parsed.hostname = parsed.hostname.replace("-pooler", "");
    // These are pooler-specific and meaningless (or harmful) on a direct link.
    parsed.searchParams.delete("pgbouncer");
    parsed.searchParams.delete("connection_limit");
    return parsed.toString();
  } catch {
    return null;
  }
}

let directValue = direct.value;
let directSource = direct.name;

const derived = unpool(directValue);
if (derived) {
  directValue = derived;
  directSource = `${direct.name} (pooler suffix removed)`;
}

process.env.DATABASE_URL = pooled.value;
process.env.DIRECT_URL = directValue;

/** Host only. Build logs are not a secret store, so never the whole URL. */
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "unparseable";
  }
};

console.log(`  app queries ← ${pooled.name}  (${hostOf(pooled.value)})`);
console.log(`  migrations  ← ${directSource}  (${hostOf(directValue)})`);

if (hostOf(pooled.value) === hostOf(directValue) && hostOf(directValue).includes("-pooler")) {
  console.log(
    "\n  WARNING: migrations are about to run through a connection pooler.\n" +
      "  If this fails, set DIRECT_URL to the unpooled connection string.\n"
  );
}

const run = (command) => {
  console.log(`\n$ ${command}`);
  try {
    execSync(command, { stdio: "inherit", env: process.env });
  } catch {
    // execSync throws an Error whose dump buries the real message that the
    // child already printed above. Exit quietly so the last thing in the log
    // is the actual cause.
    console.error(`\n  Build stopped: "${command}" failed. The error is just above.\n`);
    process.exit(1);
  }
};

run("prisma generate");
run("prisma migrate deploy");
run("next build");
