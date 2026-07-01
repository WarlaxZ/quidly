import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  // Buffer lines eagerly so piped (non-TTY) input works correctly in Node 25+
  const lines: string[] = [];
  const waiting: Array<(line: string) => void> = [];

  const rl = createInterface({ input: stdin, output: stdout, terminal: false });
  rl.on("line", (line) => {
    if (waiting.length > 0) {
      waiting.shift()!(line);
    } else {
      lines.push(line);
    }
  });

  const nextLine = (): Promise<string> => {
    if (lines.length > 0) return Promise.resolve(lines.shift()!);
    return new Promise((resolve) => waiting.push(resolve));
  };

  stdout.write("Username: ");
  const username = (await nextLine()).trim();
  stdout.write("Password: ");
  const password = await nextLine();
  rl.close();

  if (!username || !password) {
    console.error("Username and password are required.");
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const escapedForDotenv = hash.replace(/\$/g, "\\$");   // Next.js local-dev .env
  const escapedForCompose = hash.replace(/\$/g, "$$$$"); // docker compose .env (env_file)

  console.log(`\nAUTH_USERNAME=${username}\n`);
  console.log("Pick the AUTH_PASSWORD_HASH line for how you run Quidly:\n");
  console.log("• Local dev (npm run dev — Next reads .env, escape $ with \\):");
  console.log(`    AUTH_PASSWORD_HASH=${escapedForDotenv}\n`);
  console.log("• Docker Compose (.env read by docker-compose.yml — double each $):");
  console.log(`    AUTH_PASSWORD_HASH=${escapedForCompose}\n`);
  console.log("• A real environment variable (systemd EnvironmentFile, exported var — raw hash):");
  console.log(`    AUTH_PASSWORD_HASH=${hash}\n`);
  console.log("Also set a long SESSION_SECRET (32+ chars), e.g.:  openssl rand -base64 32\n");
}

main();
