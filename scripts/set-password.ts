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
  const escapedForDotenv = hash.replace(/\$/g, "\\$");
  console.log("\nAdd these to your .env (and keep them secret):\n");
  console.log(`AUTH_USERNAME=${username}`);
  console.log(`AUTH_PASSWORD_HASH=${escapedForDotenv}`);
  console.log(`\n(The backslashes before $ are required so Next.js's .env loader doesn't`);
  console.log(` treat the hash as variable references. If you instead set AUTH_PASSWORD_HASH`);
  console.log(` as a real environment variable, e.g. in Docker/systemd, use the UNescaped hash:`);
  console.log(`   ${hash})`);
  console.log(`\nAlso set a long SESSION_SECRET (32+ chars), e.g.:`);
  console.log(`SESSION_SECRET=$(openssl rand -base64 32)\n`);
}

main();
