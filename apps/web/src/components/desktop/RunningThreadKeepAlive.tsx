import { useAtomMount, useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { primaryRunningThreadCountAtom, runningThreadKeepAliveAtom } from "../../state/threads";

export function RunningThreadKeepAlive() {
  useAtomMount(runningThreadKeepAliveAtom);
  const working = useAtomValue(primaryRunningThreadCountAtom);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the desktop app installs an update when the window closes only if no chat is working
  useEffect(() => {
    void window.desktopBridge?.setChatsWorking(working).catch(() => undefined);
  }, [working]);
  return null;
}
