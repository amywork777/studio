import { assert, it } from "@effect/vitest";

import { updateOf } from "./AppUpdated.ts";

it("counts a launch of a newer or older release than the last one", () => {
  assert.deepEqual(updateOf("0.1.10\n", "0.1.11"), { from: "0.1.10", to: "0.1.11" });
  assert.deepEqual(updateOf("0.1.11", "0.1.10"), { from: "0.1.11", to: "0.1.10" });
});

it("counts nothing on a first launch, the same version, or a build from source", () => {
  assert.isNull(updateOf(null, "0.1.11"));
  assert.isNull(updateOf("0.1.11", "0.1.11"));
  assert.isNull(updateOf("my-build", "0.1.11"));
  assert.isNull(updateOf("0.1.10", "/Users/amy/build"));
});
