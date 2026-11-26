import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { type ReactNode, useEffect, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { workspaceAssetResource } from "../files/filePreviewMode";
import { openPdf } from "../files/pdfDocument";

/** Wide enough for a card at twice its size; a drawing's title block is legible, its notes are not. */
const WIDTH = 480;
/** A drawing larger than this is shown by its icon: a thumbnail is not worth reading 20 MB. */
const MOST_BYTES = 20 * 1024 * 1024;

/** First pages by their file's address, for the session; "none" where one could not be drawn. */
const drawn = new Map<string, string | "none">();
/** One drawing at a time, so a folder of them never stalls the page. */
let queue: Promise<unknown> = Promise.resolve();

async function firstPage(url: string): Promise<string | "none"> {
  try {
    const response = await fetch(url);
    if (!response.ok) return "none";
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MOST_BYTES) return "none";
    const task = openPdf(bytes);
    const document = await task.promise;
    try {
      const page = await document.getPage(1);
      const sheet = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / sheet.width });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (context === null) return "none";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL("image/png");
    } finally {
      void task.destroy();
    }
  } catch {
    return "none";
  }
}

/**
 * A PDF's first page as a picture, drawn here with pdf.js: a drawing reads by its sheet, not by an
 * icon. Nothing while it is drawn or where it cannot be, so the caller's icon stands.
 */
export function PdfPageThumb(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly path: string;
  readonly className: string;
  readonly fallback: ReactNode;
}) {
  const resource = workspaceAssetResource({
    kind: "workspace-file",
    threadRef: props.threadRef,
    draft: true,
    workspaceRoot: props.root,
    absolutePath: `${props.root.replace(/[\\/]+$/, "")}/${props.path}`,
  });
  const asset = useAssetUrlState(props.environmentId, resource);
  const url = asset._tag === "Success" ? asset.url : null;
  const [picture, setPicture] = useState<{ url: string; src: string | "none" } | null>(null);
  const known = url === null ? undefined : (drawn.get(url) ?? undefined);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- draws the PDF's first page with pdf.js, outside React, once per file address
  useEffect(() => {
    if (url === null || drawn.has(url)) return;
    let cancelled = false;
    const job = queue.then(async () => {
      if (!drawn.has(url)) drawn.set(url, await firstPage(url));
      if (!cancelled) setPicture({ url, src: drawn.get(url) ?? "none" });
    });
    queue = job.catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  const src = known ?? (picture?.url === url ? picture.src : undefined);
  if (src === undefined || src === "none") return props.fallback;
  return <img src={src} alt="" className={props.className} />;
}
