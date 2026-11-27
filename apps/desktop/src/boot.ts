// The Studio app first points itself at the bundle it carries (studio/studioAppBundle.ts).
import * as NodeOS from "node:os";

import { applyStudioAppBundle } from "./studio/studioAppBundle.ts";
import { stopStudioEngine } from "./studio/studioEngine.ts";

const studioEngine = applyStudioAppBundle({
  resourcesPath: process.resourcesPath,
  homeDirectory: NodeOS.homedir(),
  env: process.env,
});
// After the backend and its agents have stopped, so none starts the engine again.
if (studioEngine !== null) process.once("exit", () => stopStudioEngine(studioEngine));
require("./compileCache.cjs");
require("./main.cjs");
