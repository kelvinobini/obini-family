import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

/**
 * One error funnel for every route handler. Authorization failures surface as
 * a real 403 with a sentence a relative can understand — not a redirect, and
 * not a 200 with an error inside it, because the Definition of Done asks for a
 * direct API call to be refused with a status code.
 */
export function apiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: err.message, code: err.status === 401 ? "unauthenticated" : "forbidden" },
      { status: err.status }
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Some of those details didn't look right.",
        code: "invalid",
        issues: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 }
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message, code: "not_found" }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message, code: "conflict" }, { status: 409 });
  }

  console.error("[api]", err);
  return NextResponse.json(
    { error: "Something went wrong on our side.", code: "server_error" },
    { status: 500 }
  );
}

export class NotFoundError extends Error {
  constructor(message = "We couldn't find that.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "That conflicts with something already recorded.") {
    super(message);
    this.name = "ConflictError";
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

/** Wraps a handler so no route can forget the error funnel. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (err) {
      return apiError(err);
    }
  };
}
