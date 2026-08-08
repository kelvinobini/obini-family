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

process.env.DATABASE_URL = pooled.value;
process.env.DIRECT_URL = direct.value;

// Names only. Never the values — build logs are not a secret store.
console.log(`  database  ← ${pooled.name}`);
console.log(`  migrations ← ${direct.name}`);
if (pooled.name === direct.name) {
  console.log(
    "  note: pooled and direct are the same connection. Fine locally;\n" +
      "        on serverless, attach a pooler before the family grows."
  );
}

const run = (command) => {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", env: process.env });
};

run("prisma generate");
run("prisma migrate deploy");
run("next build");
