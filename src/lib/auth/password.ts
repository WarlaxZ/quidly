import { hash, verify } from "@node-rs/argon2";

/** Hash a plaintext password with argon2id (library defaults are argon2id). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verify a plaintext password against an argon2id hash. Returns false on any mismatch or malformed hash. */
export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    // A throw here (vs a normal false) indicates a malformed hash — operator misconfiguration.
    console.warn("verifyPassword: argon2 verify threw — is AUTH_PASSWORD_HASH a valid argon2id hash?");
    return false;
  }
}
