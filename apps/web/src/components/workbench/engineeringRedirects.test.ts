import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { Route as ChatRoute } from "../../routes/_chat";
import { Route as PullRequestsRoute } from "../../routes/_chat.pull-requests";
import { Route as UsageRoute } from "../../routes/_chat.usage";

// The engineering interface has no pull requests or usage page; the code interfaces keep both.
const interfaceIs = vi.hoisted(() => ({ engineering: true }));
vi.mock("./studioInterface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studioInterface")>()),
  isEngineeringInterface: () => interfaceIs.engineering,
}));
afterEach(() => {
  interfaceIs.engineering = true;
});

const signedIn = { context: { authGateState: { status: "authenticated" } } } as never;

/** What a route's `beforeLoad` throws, or null where it lets the page open. */
async function thrownBy(beforeLoad: unknown, args: never): Promise<unknown> {
  try {
    await (beforeLoad as (args: never) => unknown)(args);
    return null;
  } catch (thrown) {
    return thrown;
  }
}

describe("pull requests and usage in the engineering interface", () => {
  it("sends /pull-requests to Home, replacing the entry in the history", async () => {
    const thrown = await thrownBy(PullRequestsRoute.options.beforeLoad, {} as never);
    expect(thrown).toMatchObject({ options: { to: "/", replace: true } });
  });

  it("sends /usage to Home, replacing the entry in the history", async () => {
    const thrown = await thrownBy(UsageRoute.options.beforeLoad, signedIn);
    expect(thrown).toMatchObject({ options: { to: "/", replace: true } });
  });

  it("still sends an unpaired visitor to /pair first", async () => {
    // The usage page sits in the chat layout, whose `beforeLoad` runs before the page's own.
    const thrown = await thrownBy(ChatRoute.options.beforeLoad, {
      context: { authGateState: { status: "unauthenticated" } },
      location: { pathname: "/usage" },
    } as never);
    expect(thrown).toMatchObject({ options: { to: "/pair" } });
  });

  it("leaves both pages open in the code interfaces", async () => {
    interfaceIs.engineering = false;
    expect(await thrownBy(PullRequestsRoute.options.beforeLoad, {} as never)).toBeNull();
    expect(await thrownBy(UsageRoute.options.beforeLoad, signedIn)).toBeNull();
  });
});
