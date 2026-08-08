"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import FamilyCrest from "@/components/FamilyCrest";
import { APP_NAME } from "@/lib/settings";

type User = {
  name: string;
  firstName: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
  personId: string | null;
  isPrimaryAdmin: boolean;
};

/**
 * Mobile-first chrome: a bottom bar on phones, where thumbs are, and a plain
 * horizontal bar from tablet up. Every destination is a word, not an icon
 * alone — an icon nobody recognises is not navigation.
 */
export default function AppShell({
  user,
  pendingReviews,
  children,
}: {
  user: User;
  pendingReviews: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const links = [
    { href: "/home", label: "Home" },
    { href: "/tree", label: "Tree" },
    { href: "/people", label: "Family" },
    { href: "/stories", label: "Stories" },
    { href: "/relate", label: "Relations" },
  ];

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  }

  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-[var(--color-paper-3)] bg-[var(--color-paper)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/home" className="flex items-center gap-2.5">
            <FamilyCrest className="h-9 w-9 shrink-0" />
            <span className="font-serif text-lg font-semibold text-[var(--color-indigo-deep)]">
              {APP_NAME}
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-[0.95rem] font-medium ${
                  active(l.href)
                    ? "bg-[var(--color-indigo-soft)] text-[var(--color-indigo-deep)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-2)]"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className={`relative rounded-lg px-3 py-2 text-[0.95rem] font-medium ${
                  active("/admin")
                    ? "bg-[var(--color-indigo-soft)] text-[var(--color-indigo-deep)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-2)]"
                }`}
              >
                Admin
                {pendingReviews > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--color-terracotta)] px-1.5 py-0.5 text-[0.7rem] font-bold text-white">
                    {pendingReviews}
                  </span>
                )}
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {user.personId && (
              <Link
                href={`/people/${user.personId}`}
                className="hidden rounded-lg px-3 py-2 text-[0.95rem] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-2)] sm:block"
              >
                {user.firstName}
              </Link>
            )}
            <button
              onClick={signOut}
              disabled={signingOut}
              className="btn btn-quiet px-3 py-2 text-[0.9rem]"
            >
              {signingOut ? "…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>

      {/* Phone navigation. Large targets, always visible, no hover anywhere. */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--color-paper-3)] bg-white md:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-5">
          {[...links.slice(0, 4), user.role === "ADMIN"
            ? { href: "/admin", label: "Admin" }
            : { href: "/relate", label: "Relations" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.78rem] font-semibold ${
                active(l.href)
                  ? "text-[var(--color-terracotta)]"
                  : "text-[var(--color-ink-soft)]"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {ICONS[l.href] ?? "•"}
              </span>
              {l.label}
              {l.href === "/admin" && pendingReviews > 0 && (
                <span className="absolute mt-[-28px] ml-8 rounded-full bg-[var(--color-terracotta)] px-1.5 text-[0.65rem] font-bold text-white">
                  {pendingReviews}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

const ICONS: Record<string, string> = {
  "/home": "⌂",
  "/tree": "⑂",
  "/people": "☰",
  "/stories": "❝",
  "/relate": "⇄",
  "/admin": "⚙",
};
