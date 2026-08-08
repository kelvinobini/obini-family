/**
 * A small mark for the family — a tree whose roots and branches mirror each
 * other, because this archive reads in both directions. Deliberately not a
 * logo: no wordmark, no product feel.
 */
export default function FamilyCrest({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="The Obini family tree"
      fill="none"
    >
      <circle cx="32" cy="32" r="30" fill="var(--color-gold-soft)" />
      <circle
        cx="32"
        cy="32"
        r="30"
        stroke="var(--color-gold)"
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* trunk */}
      <path
        d="M32 20v24"
        stroke="var(--color-indigo-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* branches, reaching up */}
      <path
        d="M32 26c-5-4-9-4-12-8M32 26c5-4 9-4 12-8M32 34c-4-3-7-3-9-6M32 34c4-3 7-3 9-6"
        stroke="var(--color-sage)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* roots, reaching down — same shape, mirrored */}
      <path
        d="M32 44c-4 3-7 3-9 6M32 44c4 3 7 3 9 6"
        stroke="var(--color-terracotta)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* the people */}
      <circle cx="20" cy="18" r="3" fill="var(--color-indigo-deep)" />
      <circle cx="44" cy="18" r="3" fill="var(--color-indigo-deep)" />
      <circle cx="23" cy="28" r="2.4" fill="var(--color-sage)" />
      <circle cx="41" cy="28" r="2.4" fill="var(--color-sage)" />
      <circle cx="23" cy="50" r="2.4" fill="var(--color-terracotta)" />
      <circle cx="41" cy="50" r="2.4" fill="var(--color-terracotta)" />
    </svg>
  );
}
