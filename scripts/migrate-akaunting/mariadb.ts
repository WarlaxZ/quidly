import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTAINER = "quidly-akaunting-migrate";
const IMAGE = "mariadb:11";
const DB = "akaunting";
const PW = "root";

function docker(args: string[], opts: { input?: Buffer } = {}) {
  const res = spawnSync("docker", args, { input: opts.input, encoding: "buffer" });
  if (res.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${res.stderr?.toString() ?? ""}`);
  }
  return res.stdout;
}

/** Start MariaDB, wait until ready, load the dump. Caller MUST call stop(). */
export async function startMariaWithDump(dumpPath: string): Promise<{ mysqlConfig: object; stop: () => void }> {
  // Clean any stale container from a previous interrupted run.
  spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("Docker is required for `analyse` but was not found. Install/start Docker and retry.");
  }
  docker(["run", "-d", "--name", CONTAINER, "-p", "13306:3306",
    "-e", `MARIADB_ROOT_PASSWORD=${PW}`, "-e", `MARIADB_DATABASE=${DB}`, IMAGE]);

  const stop = () => spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });

  // Wait until the server answers.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = spawnSync("docker", ["exec", CONTAINER, "mariadb", `-uroot`, `-p${PW}`, "-e", "SELECT 1"], { stdio: "ignore" });
    if (res.status === 0) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (Date.now() >= deadline) { stop(); throw new Error("MariaDB did not become ready in time."); }
  }

  // Load the dump.
  const dump = readFileSync(dumpPath);
  const load = spawnSync("docker", ["exec", "-i", CONTAINER, "mariadb", `-uroot`, `-p${PW}`, DB], { input: dump });
  if (load.status !== 0) { stop(); throw new Error(`Loading dump failed: ${load.stderr?.toString() ?? ""}`); }

  return {
    mysqlConfig: { host: "127.0.0.1", port: 13306, user: "root", password: PW, database: DB },
    stop,
  };
}
