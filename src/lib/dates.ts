import type { DatePrecision } from "@prisma/client";

/**
 * Family dates are rarely clean. "Born during the war", "sometime in the
 * fifties", "we think 1948" are all real answers and all worth keeping, so a
 * date is stored as an optional timestamp, a precision, and a free-text
 * fallback — and displayed as whatever the family actually knows.
 */

export function formatFamilyDate(
  date: Date | null | undefined,
  precision: DatePrecision | null | undefined,
  text: string | null | undefined
): string {
  if (text && (!date || precision === "UNKNOWN")) return text;
  if (!date) return text || "Not recorded";

  const d = new Date(date);
  switch (precision) {
    case "EXACT":
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    case "MONTH":
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        timeZone: "UTC",
      });
    case "YEAR":
      return String(d.getUTCFullYear());
    case "APPROX":
      return `about ${d.getUTCFullYear()}`;
    default:
      return text || String(d.getUTCFullYear());
  }
}

export function lifespan(person: {
  birthDate: Date | null;
  birthPrecision: DatePrecision;
  birthDateText: string | null;
  deathDate: Date | null;
  deathPrecision: DatePrecision;
  deathDateText: string | null;
  isDeceased: boolean;
}): string {
  const born = person.birthDate
    ? shortYear(person.birthDate, person.birthPrecision)
    : person.birthDateText || "?";
  if (!person.isDeceased) return `b. ${born}`;
  const died = person.deathDate
    ? shortYear(person.deathDate, person.deathPrecision)
    : person.deathDateText || "?";
  return `${born} – ${died}`;
}

function shortYear(date: Date, precision: DatePrecision): string {
  const year = new Date(date).getUTCFullYear();
  return precision === "APPROX" ? `c. ${year}` : String(year);
}

export function ageInYears(birthDate: Date | null, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const ms = at.getTime() - new Date(birthDate).getTime();
  if (ms < 0) return null;
  return Math.floor(ms / (365.2425 * 24 * 60 * 60 * 1000));
}

/** Parses the <input type="date"> value into a UTC-midnight Date, or null. */
export function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

/** Ordinal used for birth order: "3rd of 7". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function birthOrderPhrase(
  order: number | null | undefined,
  total: number | null | undefined
): string | null {
  if (!order) return null;
  return total ? `${ordinal(order)} of ${total}` : `${ordinal(order)} child`;
}

/** Same month and day, ignoring year — for birthdays and remembrance dates. */
export function isSameMonthDay(a: Date, b: Date): boolean {
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export function daysUntilAnniversary(date: Date, from: Date = new Date()): number {
  const ref = new Date(
    Date.UTC(from.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  if (ref.getTime() < Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) {
    ref.setUTCFullYear(ref.getUTCFullYear() + 1);
  }
  return Math.round(
    (ref.getTime() -
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) /
      86400000
  );
}
