import { describe, expect, it } from "vitest";
import { sealData, unsealData } from "iron-session";
import { sessionOptions, type SessionData } from "./session-config";

describe("session sealing", () => {
  it("round-trips an authenticated session with the configured password", async () => {
    const sealed = await sealData({ authenticated: true, username: "alice" } satisfies SessionData, { password: sessionOptions.password });
    const data = await unsealData<SessionData>(sealed, { password: sessionOptions.password });
    expect(data.authenticated).toBe(true);
    expect(data.username).toBe("alice");
  });
  it("uses an httpOnly, lax cookie", () => {
    expect(sessionOptions.cookieName).toBe("ppa_session");
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true);
    expect(sessionOptions.cookieOptions?.sameSite).toBe("lax");
  });
});
