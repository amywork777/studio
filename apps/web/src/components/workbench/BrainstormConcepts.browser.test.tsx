import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { WorkspaceMutationIdContext } from "../chat/ChatMarkdownMedia";
import { ReplyConcepts } from "./BrainstormConcepts";

const mocks = vi.hoisted(() => ({ readFile: (_input: unknown): unknown => null }));
vi.mock("~/state/projects", () => ({
  projectEnvironment: { readFile: (input: unknown) => mocks.readFile(input) },
}));
vi.mock("../chat/ChatMarkdownMedia", async () => ({
  WorkspaceMutationIdContext: (await import("react")).createContext<string | null>(null),
}));
vi.mock("./useStudioProjects", () => ({
  useStudioProjectsList: () => ({ data: { folder: "/records" } }),
  useStudioProjectAt: () => ({ id: "plate" }),
}));
vi.mock("./useFolderModels", () => ({ useFolderModels: () => [] }));
vi.mock("./useOpenInWorkbench", () => ({ useOpenInWorkbench: () => () => {} }));
vi.mock("./useNewPart", () => ({ useAddPart: () => null }));
vi.mock("~/composerHandleContext", () => ({ useComposerHandleContext: () => null }));
vi.mock("~/assets/assetUrls", () => ({ useAssetUrlState: () => ({ _tag: "Initial" }) }));

function setup() {
  let contents: string | null = null;
  const file = Atom.make(() =>
    AsyncResult.success(
      contents === null ? { exists: false as const, contents: "" } : { contents },
    ),
  );
  mocks.readFile = () => file;
  return {
    write: () => {
      contents = JSON.stringify({
        concepts: [{ name: "Cable comb", script: "comb.py", idea: "Open slots" }],
      });
    },
  };
}

it("shows a concept set created after an earlier reply linked its missing file", async () => {
  const files = setup();
  const reply = (
    <ReplyConcepts
      reply="[Concepts](/records/plate/brainstorm/thread-1/set-1/concepts.json)"
      threadRef={{
        environmentId: EnvironmentId.make("local"),
        threadId: ThreadId.make("thread-1"),
      }}
      root="/plate"
    />
  );
  await using screen = await render(
    <WorkspaceMutationIdContext value="before">{reply}</WorkspaceMutationIdContext>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Open Cable comb" }))
    .not.toBeInTheDocument();
  files.write();
  await screen.rerender(
    <WorkspaceMutationIdContext value="after">{reply}</WorkspaceMutationIdContext>,
  );
  await expect.element(screen.getByRole("button", { name: "Open Cable comb" })).toBeVisible();
});
