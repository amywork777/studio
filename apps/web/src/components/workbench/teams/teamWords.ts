import type { StudioTeamRole } from "@t3tools/contracts";
import { useState } from "react";

import { plainError } from "../BackupDialog";

/** Each role as the Team section and the check-out strip say it. */
export const ROLE_LABEL: Record<StudioTeamRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

/** One team call at a time from a control, with what stopped it in the hub's own words. */
export function useTeamAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((cause: unknown) => setError(plainError(cause)))
      .finally(() => setBusy(false));
  };
  return { busy, error, run };
}
