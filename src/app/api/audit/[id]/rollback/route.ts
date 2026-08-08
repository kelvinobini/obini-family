import { NextRequest } from "next/server";
import { handler, ok } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { rollbackAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Undo one logged change. The undo is itself logged. */
export const POST = handler(async (_req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  assertRole(actor, "audit:rollback");
  const { id } = await ctx.params;

  const result = await rollbackAudit(id, actor);
  return ok(result, result.ok ? 200 : 409);
});
