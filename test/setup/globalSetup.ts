import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const TEST_DB_FILE = path.join(ROOT, "test.db");

export default function setup() {
  rmSync(TEST_DB_FILE, { force: true });
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  const opts = { stdio: "inherit" as const, env, cwd: ROOT };
  execSync("npx prisma migrate deploy", opts);
  execSync("npx tsx prisma/seed.ts", opts);
  return () => {
    rmSync(TEST_DB_FILE, { force: true });
  };
}
