import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

/**
 * A cheap first gate: anything that is not explicitly public and arrives with
 * no session cookie is bounced to sign-in before it can render.
 *
 * This is a convenience, NOT the security boundary. Middleware runs on the
 * edge and cannot reach the database, so it can only see that a cookie exists,
 * not that it is valid. Every page and every route handler re-checks the real
 * session server-side, and every write goes through authz.ts. Forging the
 * cookie gets you past this file and nothing else.
 */

const PUBLIC_PREFIXES = [
  "/signin",
  "/invite", // accepting an invitation, by definition, precedes having a session
  "/contribute", // the no-login contributor form
  "/api/auth",
  "/_next",
  "/favicon",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    // Media and API calls should fail honestly rather than redirect an <img>
    // into an HTML sign-in page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Not signed in", code: "unauthenticated" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
