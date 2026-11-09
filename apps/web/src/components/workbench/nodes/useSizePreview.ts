import { useEffect, useState } from "react";

import type { CadPost } from "../useVersions";
import {
  readBody,
  readChange,
  readEditState,
  sizeUses,
  typedPreview,
  type Change,
  type Drawn,
  type EditState,
} from "./sizePreview";

/** What one size does to one part, as its card draws it. */
export interface PartPreview {
  readonly status: "working" | "done";
  /** The whole part as it is. */
  readonly body: Drawn | null;
  readonly change: Change | null;
  /** Why there is no change to draw, in plain words. */
  readonly note: string | null;
}

/** A size being looked at: where it is written, its name and its number now. */
export interface PreviewedSize {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly now: number;
}

/** Pointing at a size previews it this much larger: enough to move its faces, not to break the part. */
const NUDGE = 1.1;
const WAIT_MS = 220;
const NOTHING: ReadonlyMap<string, PartPreview> = new Map();

// Each read once a session per part and change of the project (`mutationId`), each preview once.
const states = new Map<string, Promise<EditState | null>>();
const bodies = new Map<string, Promise<Drawn | null>>();
const changes = new Map<string, Promise<Change | null>>();
const once = <T>(cache: Map<string, Promise<T>>, key: string, ask: () => Promise<T>) => {
  const held = cache.get(key);
  if (held !== undefined) return held;
  const asked = ask();
  cache.set(key, asked);
  // A failed ask is asked again next time.
  void asked.then((value) => {
    if (value === null) cache.delete(key);
  });
  return asked;
};

/**
 * Previews `size` in each of `parts` (node id and script, from the project's folder `root`) as
 * edit mode previews a size typed over: the part built in memory with it, nothing written. With
 * `typed`, at that number; without, a little larger, which lights what the size shapes.
 */
export function useSizePreview(input: {
  readonly post: CadPost | null;
  readonly root: string;
  readonly mutationId: string | null;
  readonly parts: ReadonlyArray<{ readonly id: string; readonly script: string }>;
  readonly size: PreviewedSize | null;
  readonly typed: number | null;
}): ReadonlyMap<string, PartPreview> {
  const { post, root, size, typed } = input;
  const partsKey = input.parts.map((part) => `${part.id}\n${part.script}`).join("\t");
  const sizeKey = size === null ? "" : `${size.file}:${size.line}:${size.name}:${size.now}`;
  // What has come back, for the parts and the size asked: anything else asked shows nothing yet.
  const asking = [partsKey, sizeKey, typed ?? "", input.mutationId ?? ""].join("|");
  const [shown, setShown] = useState<{
    readonly key: string;
    readonly map: Map<string, PartPreview>;
  }>({ key: "", map: new Map() });
  useEffect(() => {
    if (post === null || size === null || partsKey === "") return;
    let live = true;
    const parts = partsKey.split("\t").map((entry) => {
      const [id = "", script = ""] = entry.split("\n");
      return { id, script };
    });
    const put = (id: string, preview: PartPreview) => {
      if (!live) return;
      setShown((before) => ({
        key: asking,
        map: new Map(before.key === asking ? before.map : []).set(id, preview),
      }));
    };
    const timer = setTimeout(() => {
      void (async () => {
        for (const part of parts) {
          if (!live) return;
          const file = `${root}/${part.script}`;
          const base = `${input.mutationId ?? ""}\n${file}`;
          put(part.id, { status: "working", body: null, change: null, note: null });
          const state = await once(states, base, async () =>
            readEditState(await post("/api/v1/local/edit/state", { file })),
          );
          if (state === null || state.assembly) {
            put(part.id, {
              status: "done",
              body: null,
              change: null,
              note: state === null ? "Not read" : "Shown in its parts",
            });
            continue;
          }
          const ask = typedPreview(
            sizeUses(state, size.file, size.line),
            size.name,
            size.now,
            typed ?? size.now * NUDGE,
            state.units,
          );
          const body = await once(bodies, base, async () =>
            readBody(
              await post("/api/v1/local/edit/change", {
                file,
                draft_check: { pull: [0, 0, 1], angle: 1 },
              }),
            ),
          );
          if (ask === null) {
            put(part.id, {
              status: "done",
              body,
              change: null,
              note: "No feature here takes it alone",
            });
            continue;
          }
          const change = await once(changes, `${base}\n${JSON.stringify(ask)}`, async () =>
            readChange(await post("/api/v1/local/edit/change", { file, preview_sizes: ask })),
          );
          put(part.id, {
            status: "done",
            body,
            change,
            note: change === null ? "Not previewed" : change.error,
          });
        }
      })();
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Asked again when what is asked (`asking`) changes.
  }, [post, root, asking]);
  return shown.key === asking ? shown.map : NOTHING;
}
