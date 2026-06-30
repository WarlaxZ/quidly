import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { attemptLogin } from "../../../lib/auth/login";
import { sessionOptions, type SessionData } from "../../../lib/auth/session-config";
import { safePath } from "../../../lib/auth/safePath";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safePath(String(form.get("next") ?? "/dashboard"));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) ?? null;

  const result = await attemptLogin({ username, password, ip });

  if (!result.ok) {
    const msg = result.reason === "locked" ? "Too many attempts. Please try again later." : "Invalid username or password.";
    const url = new URL(`/login?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`, request.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  const session = await getIronSession<SessionData>(request, res, sessionOptions);
  session.authenticated = true;
  session.username = result.username;
  await session.save();
  return res;
}
