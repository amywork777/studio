// A thread's Studio project in its turns' runtime policy, spread in by `RuntimePolicy.ts` with one line.
import type { ModelSelection, OrchestrationV2AppThread } from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import {
  studioOtherFolders,
  studioProjectAt,
  studioProjectContext,
} from "@t3tools/shared/studioProjects";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as StudioProjects from "./StudioProjects.ts";

type StudioProjectPolicy = Partial<
  Pick<ProviderAdapter.ProviderAdapterV2RuntimePolicy, "additionalDirectories" | "projectContext">
>;

/**
 * Adds a thread's Studio project to its turns (other folders, the record's folder, its context),
 * matched by the project's folder so a worktree thread gets its project's. A project that cannot
 * be read adds nothing rather than fail the turn. `projectRoot` is the project's folder when the
 * caller already has it; otherwise it is read from the project store.
 */
export const makeStudioProjectPolicy = Effect.fn("RuntimePolicyV2.makeStudioProjectPolicy")(
  function* () {
    const projects = yield* ProjectStore.ProjectStoreV2;
    // Optional so tests that assemble the runtime policy by hand need no projects stub;
    // the production composition always provides it.
    const studioProjects = yield* Effect.serviceOption(StudioProjects.StudioProjects);
    return Effect.fn("RuntimePolicyV2.studioProjectPolicy")(function* (
      input: { readonly thread: OrchestrationV2AppThread; readonly modelSelection: ModelSelection },
      projectRoot: string | null,
    ) {
      if (Option.isNone(studioProjects)) return {} as StudioProjectPolicy;
      return yield* Effect.gen(function* () {
        const { folder, projects: studio } = yield* studioProjects.value.list;
        if (Object.keys(studio).length === 0) return {};
        const root =
          projectRoot ??
          (yield* projects.get(input.thread.projectId).pipe(
            Effect.flatMap(Effect.fromOption),
            Effect.map((project) => project.workspaceRoot),
          ));
        const match = studioProjectAt(studio, root);
        if (match === null) return {};
        // The project's own folder under Studio's projects folder (an absolute path the server made).
        const record = `${folder.replace(/[\\/]+$/, "")}/${match.id}`;
        return {
          additionalDirectories: [...studioOtherFolders(match.project, root), record],
          projectContext: studioProjectContext(match.project, root, `${record}/project.json`),
        };
      }).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Could not resolve the thread's Studio project; leaving it out.", {
            threadId: input.thread.id,
            cause,
          }).pipe(Effect.as<StudioProjectPolicy>({})),
        ),
      );
    });
  },
);
