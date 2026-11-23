// @effect-diagnostics nodeBuiltinImport:off -- reads the sources whose words this matches.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  CAD_TOOLS_IN_USE,
  CAD_TOOLS_STARTING,
  cadToolsCause,
  viewFailure,
  viewFailureRequest,
} from "./cadToolsCause";

const repo = NodePath.join(import.meta.dirname, ...Array.from({ length: 5 }, () => ".."));
const source = (path: string) => NodeFS.readFileSync(NodePath.join(repo, path), "utf8");

/** A start's failure as the server words it (`PluginHost.connect`), with the server's last lines. */
const notStarted = (why: string) => `cad did not start: ${why}\nINFO starting the engine`;

describe("cadToolsCause", () => {
  it("says another copy of Studio has the CAD tools when the engine's port is held", () => {
    for (const who of [
      "another process",
      "another cad-server (python3, pid 412)",
      "python.exe (pid 9120)",
    ]) {
      expect(
        cadToolsCause(
          notStarted(
            `MCP error -32603: ConnectionError: port 3345 is held by ${who}: stop it, or start the server with another CAD_ENGINE_PORT`,
          ),
        ),
      ).toBe(CAD_TOOLS_IN_USE);
    }
  });

  it("says the CAD tools are still starting when their start ran past its limit", () => {
    expect(cadToolsCause(notStarted("MCP error -32001: Request timed out"))).toBe(
      CAD_TOOLS_STARTING,
    );
  });

  it("names no cause for any other failure", () => {
    for (const message of [
      notStarted("spawn /Applications/Studio.app/python3 ENOENT"),
      notStarted("MCP error -32000: Connection closed"),
      // A tool that ran past its own limit is not a start.
      "The plugin did not answer in 120 seconds.",
      "text-to-cad has no view called cad_open",
      "parts/part.step is outside the thread's workspace",
      "",
      null,
      undefined,
    ]) {
      expect(cadToolsCause(message)).toBeNull();
    }
  });

  it("matches the words the engine and the server really use", () => {
    // text-to-cad's refusal of a held port, and the port Studio names for it.
    expect(source("text-to-cad/packages/cad/src/cad_server/engine/daemon.py")).toContain(
      'PortHeld(f"port {port} is held by {who}: ',
    );
    // The server's words for a plugin server that did not start, before the client's error.
    expect(source("apps/server/src/plugins/PluginHost.ts")).toContain(
      "did not start: ${sentence(error)}",
    );
  });
});

describe("viewFailure", () => {
  it("says what was not opened and why, retrying a cause a person can act on", () => {
    expect(
      viewFailure(notStarted("port 3345 is held by another process: stop it"), "Base"),
    ).toEqual({
      headline: "Not opened: Base",
      why: CAD_TOOLS_IN_USE,
      action: "retry",
    });
    expect(viewFailure("path is outside the thread's workspace", "Base").why).toBe(
      "The model view only opens files in this chat's folder.",
    );
  });

  it("asks the agent to fix any other failure, with the reason as it came", () => {
    const failure = viewFailure("ValueError: no solid in base.step", "Base");
    expect(failure).toEqual({
      headline: "Not opened: Base",
      why: "The CAD tools couldn't read it.",
      action: "ask",
    });
    expect(viewFailureRequest("Base", " ValueError: no solid in base.step\n")).toBe(
      "The model view couldn't open Base. Find out why and fix it. The error was:\nValueError: no solid in base.step",
    );
  });
});
