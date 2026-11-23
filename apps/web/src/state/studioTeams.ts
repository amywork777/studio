import { createStudioTeamsEnvironmentAtoms } from "@t3tools/client-runtime/state/studioTeams";

import { connectionAtomRuntime } from "../connection/runtime";

export const studioTeamsEnvironment = createStudioTeamsEnvironmentAtoms(connectionAtomRuntime);
