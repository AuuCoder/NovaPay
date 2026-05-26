import { execFile, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const REGISTRY_ROOT = path.join(ROOT, "apps", "registry");
const execFileAsync = promisify(execFile);
const TARGET_PORTS = [3000, 3100] as const;

type ProcSpec = {
  name: string;
  cwd: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type PortOwner = {
  port: number;
  pid: number;
  command: string;
};

const processes: ProcSpec[] = [
  {
    name: "main-3000",
    cwd: ROOT,
    command: "npm",
    args: ["run", "dev:main"],
  },
  {
    name: "registry-3100",
    cwd: REGISTRY_ROOT,
    command: "npm",
    args: ["run", "dev:registry"],
  },
];

const runningChildren = new Set<ChildProcess>();
let shuttingDown = false;
const args = new Set(process.argv.slice(2));

function prefixOutput(name: string, chunk: Buffer | string) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    process.stdout.write(`[${name}] ${line}\n`);
  }
}

function stopAll(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of runningChildren) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of runningChildren) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 1200).unref();
}

async function getPortOwner(port: number): Promise<PortOwner | null> {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-Fpc",
    ]);
    const lines = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    let pid: number | null = null;
    let command = "";

    for (const line of lines) {
      if (line.startsWith("p")) {
        const value = Number(line.slice(1));
        if (Number.isFinite(value)) {
          pid = value;
        }
      }

      if (line.startsWith("c")) {
        command = line.slice(1);
      }
    }

    if (!pid) {
      return null;
    }

    return {
      port,
      pid,
      command: command || "unknown",
    };
  } catch {
    return null;
  }
}

async function killPortOwner(owner: PortOwner) {
  try {
    process.stdout.write(
      `[workspace] Releasing :${owner.port} from PID ${owner.pid} (${owner.command})\n`,
    );
    process.kill(owner.pid, "SIGTERM");
  } catch {
    return;
  }
}

async function inspectPorts() {
  const owners = (
    await Promise.all(TARGET_PORTS.map((port) => getPortOwner(port)))
  ).filter((owner): owner is PortOwner => Boolean(owner));

  if (owners.length === 0) {
    process.stdout.write("[workspace] Ports 3000 and 3100 are free.\n");
    return owners;
  }

  for (const owner of owners) {
    process.stdout.write(
      `[workspace] Port ${owner.port} is in use by PID ${owner.pid} (${owner.command})\n`,
    );
  }

  return owners;
}

async function startWorkspace() {
  const owners = await inspectPorts();

  if (owners.length > 0 && !args.has("--reset")) {
    process.stderr.write(
      "[workspace] Start aborted because one or more target ports are busy. " +
        "Run `npm run dev:workspace:reset` to release them automatically.\n",
    );
    process.exit(1);
  }

  if (owners.length > 0 && args.has("--reset")) {
    await Promise.all(owners.map((owner) => killPortOwner(owner)));
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  for (const spec of processes) {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: {
        ...process.env,
        ...spec.env,
      },
      stdio: ["inherit", "pipe", "pipe"],
    });

    runningChildren.add(child);
    child.stdout?.on("data", (chunk) => prefixOutput(spec.name, chunk));
    child.stderr?.on("data", (chunk) => prefixOutput(spec.name, chunk));

    child.on("exit", (code, signal) => {
      runningChildren.delete(child);

      if (shuttingDown) {
        return;
      }

      const reason =
        signal !== null
          ? `${spec.name} exited via ${signal}`
          : `${spec.name} exited with code ${code ?? 0}`;
      process.stderr.write(`[workspace] ${reason}\n`);
      stopAll(code ?? 1);
    });
  }

  process.stdout.write(
    "[workspace] Starting NovaPay main site on :3000 and Registry on :3100\n",
  );
}

if (args.has("--status")) {
  await inspectPorts();
  process.exit(0);
}

await startWorkspace();

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
