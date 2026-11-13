import { useState } from "react";

import { oneAtATime } from "./oneAtATime";

/**
 * `oneAtATime` on `underWay`, with the keys this page has under way, for a button to show it.
 */
export function useOneAtATime(underWay: Map<string, Promise<void>>) {
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const run = (key: string, work: () => Promise<void>) => {
    const fresh = !underWay.has(key);
    const next = oneAtATime(underWay, key, work);
    if (fresh) {
      setBusy((current) => new Set(current).add(key));
      void next.finally(() =>
        setBusy((current) => {
          const left = new Set(current);
          left.delete(key);
          return left;
        }),
      );
    }
    return next;
  };
  return { run, busy };
}
