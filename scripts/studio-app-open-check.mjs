#!/usr/bin/env node
/**
 * Opens a built or installed Studio and reads its first screen: a release must open. It starts the
 * app itself, not its CAD tools (scripts/studio-app-check.py does those), with a home of its own, so
 * it is a person's first launch and nothing it writes is theirs. It passes once the window shows
 * words, and fails on a window that stays blank, the app's error screen, or an app that exits.
 *
 *   node scripts/studio-app-open-check.mjs <Studio.app or Studio.exe> [folder for its scratch home]
 *
 * It stops only the process it started, by the id it was given (`app.kill`, then `taskkill` for that
 * id's own tree on Windows). It then removes the scratch home, though late CAD cache files can
 * bring a folder of them back. The home also keeps the app off the person's engine and counts
 * nothing: no update check, no usage counts.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";

const OPEN_TIMEOUT_MS = 180_000;
const POLL_MS = 500;
const EXIT_TIMEOUT_MS = 15_000;
const HOME_REMOVAL_ATTEMPTS = 20;
const HOME_REMOVAL_WAIT_MS = 2_000;
const HOME_GONE_CHECKS = 5;
// Beside the app's 3345 and a checkout's 3346; the app check takes a free port of its own.
const CHECK_ENGINE_PORT = "3348";
const ERROR_SCREEN = "Something went wrong.";

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
};

/** The program inside a Mac app, or the path as it is on Windows. */
const programOf = (app) =>
  app.endsWith(".app")
    ? NodePath.join(app, "Contents", "MacOS", NodePath.basename(app, ".app"))
    : app;

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = NodeNet.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** This shell's environment without anything that would point the app at a running Studio's state. */
function checkEnvironment(home) {
  const inherited = Object.entries(process.env).filter(
    ([name]) => !/^(T3CODE_|CAD_|VITE_|ELECTRON_|STUDIO_)/.test(name),
  );
  return {
    ...Object.fromEntries(inherited),
    HOME: home,
    USERPROFILE: home,
    APPDATA: NodePath.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: NodePath.join(home, "AppData", "Local"),
    T3CODE_HOME: NodePath.join(home, "studio"),
    T3CODE_DESKTOP_PROFILE: "studio-open-check",
    T3CODE_DISABLE_AUTO_UPDATE: "1",
    T3CODE_TELEMETRY_ENABLED: "false",
    DO_NOT_TRACK: "1",
    CAD_ENGINE_PORT: CHECK_ENGINE_PORT,
  };
}

/** The app's windows, as its debugging port lists them; none until the port answers. */
async function windows(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    return targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

/** The words on one window's page, or "" when it has none yet. */
function pageText(target) {
  return new Promise((resolve) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const done = (text) => {
      clearTimeout(timer);
      socket.close();
      resolve(text);
    };
    const timer = setTimeout(() => done(""), 5_000);
    socket.addEventListener("error", () => done(""));
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: 'document.body?.innerText ?? ""', returnByValue: true },
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      const reply = JSON.parse(String(event.data));
      if (reply.id === 1) done(String(reply.result?.result?.value ?? "").trim());
    });
  });
}

/** Waits for the app's first screen; the error it failed with, or null with what it said. */
async function firstScreen(app, port, started) {
  while (Date.now() - started < OPEN_TIMEOUT_MS) {
    if (app.exitCode !== null || app.signalCode !== null) {
      return {
        problem: `the app exited (${app.exitCode ?? app.signalCode}) before it showed a window`,
      };
    }
    for (const target of await windows(port)) {
      const text = await pageText(target);
      if (text.includes(ERROR_SCREEN)) return { problem: `the app's error screen: ${text}` };
      if (text !== "") return { text };
    }
    await NodeTimersPromises.setTimeout(POLL_MS);
  }
  return { problem: `the window was still blank after ${OPEN_TIMEOUT_MS / 1000} s` };
}

/** Stops the app this check started, and nothing else. */
async function stop(app) {
  if (app.exitCode !== null || app.signalCode !== null) return;
  const exited = new Promise((resolve) => app.once("exit", resolve));
  // oxlint-disable-next-line t3code/no-global-process-runtime -- A script, outside any Effect runtime.
  if (NodeOS.platform() === "win32") {
    NodeChildProcess.spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    app.kill("SIGTERM");
  }
  const timeout = NodeTimersPromises.setTimeout(EXIT_TIMEOUT_MS).then(() => "timeout");
  if ((await Promise.race([exited, timeout])) === "timeout") {
    app.kill("SIGKILL");
    await exited;
  }
}

/**
 * Removes the scratch home, and waits to see it stay gone: the app's background setup of its CAD
 * tools can outlive the app by seconds and write there again.
 */
async function removeHome(home) {
  let gone = 0;
  for (let attempt = 0; attempt < HOME_REMOVAL_ATTEMPTS && gone < HOME_GONE_CHECKS; attempt += 1) {
    try {
      NodeFS.rmSync(home, { recursive: true, force: true });
    } catch {
      // Something is still writing there; the next attempt takes what is left.
    }
    await NodeTimersPromises.setTimeout(HOME_REMOVAL_WAIT_MS);
    gone = NodeFS.existsSync(home) ? 0 : gone + 1;
  }
  if (gone < HOME_GONE_CHECKS) console.error(`Left the scratch home at ${home}.`);
}

async function main() {
  const [appPath, scratchParent] = process.argv.slice(2);
  if (appPath === undefined) {
    console.error(
      "Usage: node scripts/studio-app-open-check.mjs <Studio.app or Studio.exe> [scratch folder]",
    );
    process.exitCode = 2;
    return;
  }
  const program = programOf(NodePath.resolve(appPath));
  if (!NodeFS.existsSync(program)) {
    fail(`no app at ${program}`);
    return;
  }
  const parent = scratchParent ?? NodeOS.tmpdir();
  NodeFS.mkdirSync(parent, { recursive: true });
  const home = NodeFS.mkdtempSync(NodePath.join(parent, "studio-open-check-"));
  const port = await freePort();
  const started = Date.now();
  const app = NodeChildProcess.spawn(
    program,
    [`--remote-debugging-port=${port}`, "--use-mock-keychain"],
    { env: checkEnvironment(home), stdio: ["ignore", "pipe", "pipe"] },
  );
  let said = "";
  const keep = (chunk) => {
    said = `${said}${chunk}`.slice(-2_000);
  };
  app.stdout.on("data", keep);
  app.stderr.on("data", keep);
  app.on("error", (error) => keep(String(error)));
  try {
    const { problem, text } = await firstScreen(app, port, started);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (problem === undefined) {
      console.log(
        `ok   the app opened in ${seconds} s: ${text.replace(/\s+/g, " ").slice(0, 160)}`,
      );
    } else {
      fail(problem);
      console.error(said.trim());
    }
  } finally {
    await stop(app);
    await removeHome(home);
  }
}

await main();
