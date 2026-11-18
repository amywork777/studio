import { nameApp } from "@t3tools/shared/appName";
import { describe, expect, it } from "vite-plus/test";

import { brandCopy } from "./brandCopy";

describe("brandCopy", () => {
  it("puts the app's name in T3's text, apart from copy about T3's own machinery", () => {
    nameApp("Studio");
    expect(brandCopy("Restart T3 Code on this device.")).toBe("Restart Studio on this device.");
    expect(brandCopy("{host} runs an older T3 Code")).toBe("{host} runs an older Studio");
    expect(brandCopy("Restart the T3 server on {label} so it runs {appVersion}")).toBe(
      "Restart the Studio server on {label} so it runs {appVersion}",
    );
    expect(brandCopy("T3 Connect is not available in this build.")).toBe(
      "Other apps cannot connect in this build.",
    );
    expect(brandCopy("Restart T3 Code on ")).toBe("Restart T3 Code on ");
    expect(brandCopy("Enable T3 Code SnapShots to start capturing windows.")).toBe(
      "Enable T3 Code SnapShots to start capturing windows.",
    );
    expect(brandCopy("Link T3 Connect")).toBe("Link T3 Connect");
  });
});
