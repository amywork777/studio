// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";

import { CAD_ACTION_FAILED, CAD_USAGE_EVENTS } from "../plugins/usageEvents.ts";

// Studio's law 9: the README names every usage event the app can send, so what a person is told
// is what the code does. Adding, renaming or dropping an event means editing that list too.
const SERVER_SOURCE = NodePath.join(import.meta.dirname, "..");
const README = NodePath.join(import.meta.dirname, "../../../../README.md");

/** Event names the server records, with a `${…}` part read as any one word. */
function recordedEvents(): ReadonlyArray<string> {
  const names = new Set<string>([...Object.values(CAD_USAGE_EVENTS), CAD_ACTION_FAILED]);
  const files = NodeFS.readdirSync(SERVER_SOURCE, { recursive: true, encoding: "utf8" });
  for (const file of files) {
    if (!file.endsWith(".ts") || /\.test(?:Fixtures)?\.ts$|testkit|\.fixture\.ts$/u.test(file)) {
      continue;
    }
    const source = NodeFS.readFileSync(NodePath.join(SERVER_SOURCE, file), "utf8");
    for (const found of source.matchAll(/\brecord\(\s*(["`])([a-z][\w.${}]*)\1/gu)) {
      const name = found[2] ?? "";
      if (name.includes(".")) names.add(name.replace(/\$\{\w+\}/gu, "*"));
    }
  }
  return [...names].toSorted();
}

function listedEvents(): ReadonlyArray<string> {
  const readme = NodeFS.readFileSync(README, "utf8");
  const section = readme.split("## Usage data")[1]?.split(/\n---\n|\n## /u)[0] ?? "";
  return [...section.matchAll(/`([a-z]+(?:\.[a-z_]+)+)`/gu)].map((found) => found[1] ?? "");
}

const matches = (pattern: string, name: string) =>
  new RegExp(`^${pattern.replaceAll(".", "\\.").replaceAll("*", "[a-z_]+")}$`, "u").test(name);

it("lists every usage event the server can send in the README", () => {
  const recorded = recordedEvents();
  const listed = listedEvents();
  assert.isAbove(recorded.length, 10, "the scan found the server's events");
  for (const pattern of recorded) {
    assert.isTrue(
      listed.some((name) => matches(pattern, name)),
      `${pattern} is sent but not listed under "Usage data" in README.md`,
    );
  }
  for (const name of listed) {
    assert.isTrue(
      recorded.some((pattern) => matches(pattern, name)),
      `${name} is listed under "Usage data" in README.md but nothing sends it`,
    );
  }
});
