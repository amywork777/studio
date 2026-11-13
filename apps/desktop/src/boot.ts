// The Studio app first points itself at the bundle it carries (studio/studioAppBundle.ts).
import * as NodeOS from "node:os";

import { applyStudioAppBundle } from "./studio/studioAppBundle.ts";

applyStudioAppBundle({
  resourcesPath: process.resourcesPath,
  homeDirectory: NodeOS.homedir(),
  env: process.env,
});
require("./compileCache.cjs");
require("./main.cjs");
