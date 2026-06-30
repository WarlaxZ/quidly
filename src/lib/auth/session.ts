import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./session-config";

/** Read/write the session in a server component, server action, or route handler. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export interface Principal {
  username: string;
}

/** The current principal, or null if unauthenticated. The single seam for future multi-tenancy. */
export async function getPrincipal(): Promise<Principal | null> {
  const session = await getSession();
  return session.authenticated && session.username ? { username: session.username } : null;
}
