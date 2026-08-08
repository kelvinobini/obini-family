import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";

/**
 * There is no marketing page. The root is a fork: family goes in, everyone
 * else goes to a sign-in screen that tells them nothing.
 */
export default async function Root() {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  redirect(actor.personId ? `/people/${actor.personId}` : "/home");
}
