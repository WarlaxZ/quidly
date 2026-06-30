import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
const TEST_DB = "file:./test.db";
export default function setup() {
  rmSync("test.db", { force: true });
  const env = { ...process.env, DATABASE_URL: TEST_DB };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
  return () => {
    rmSync("test.db", { force: true });
  };
}
