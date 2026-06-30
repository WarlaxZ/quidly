import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "../../../lib/auth/session-config";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const session = await getIronSession<SessionData>(request, res, sessionOptions);
  session.destroy();
  return res;
}
