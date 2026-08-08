/**
 * Shared between the edge middleware and the Node server. Kept apart from
 * auth.ts because that file imports Prisma and `server-only`, neither of which
 * can be bundled into middleware.
 */
export const SESSION_COOKIE = "obini_session";
export const SESSION_DAYS = 30;
