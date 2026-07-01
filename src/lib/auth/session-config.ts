import type { SessionOptions } from "iron-session";

export interface SessionData {
  authenticated?: boolean;
  username?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "",
  cookieName: "ppa_session",
  cookieOptions: {
    httpOnly: true,
    // Secure cookie in production by default; a self-hoster on plain-HTTP LAN can set COOKIE_SECURE=false.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
