import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { accountIdOf, claimHashOf, keyMatches, keyOf, licenseKey } from "./license.mjs";

const ID = "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b";

NodeTest.test("a key names its account and holds only at its secret and generation", async () => {
  const key = await licenseKey("secret", ID, 1);
  NodeAssert.match(key, /^SPRO-0b7e4c5a3c2d4f6e9a1b2c3d4e5f6a7b-[A-Za-z0-9_-]{43}$/);
  NodeAssert.equal(accountIdOf(key), ID);
  NodeAssert.equal(await keyMatches("secret", key, ID, 1), true);
  NodeAssert.equal(await keyMatches("secret", ` ${key}\n`, ID, 1), true);
  NodeAssert.equal(await keyMatches("secret", key, ID, 2), false);
  NodeAssert.equal(await keyMatches("other", key, ID, 1), false);
  NodeAssert.equal(await keyMatches("secret", key.slice(0, -1) + "A", ID, 1), false);
});

NodeTest.test("anything that is not a key names no account", () => {
  for (const text of [
    null,
    "",
    "SPRO-",
    "sk-ant-api03-abc",
    `SPRO-${"g".repeat(32)}-${"a".repeat(43)}`,
  ])
    NodeAssert.equal(accountIdOf(text), null);
});

NodeTest.test("reads the key from Claude Code's bearer token or an API key header", () => {
  NodeAssert.equal(keyOf(new Headers({ authorization: "Bearer SPRO-x" })), "SPRO-x");
  NodeAssert.equal(keyOf(new Headers({ "x-api-key": "SPRO-y" })), "SPRO-y");
  NodeAssert.equal(keyOf(new Headers()), null);
});

NodeTest.test("a claim is kept as its SHA-256", async () => {
  NodeAssert.equal(
    await claimHashOf("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
