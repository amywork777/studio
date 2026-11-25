import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { openPdf } from "../files/pdfDocument";
import { workspaceAssetResource } from "../files/filePreviewMode";
import { type DrawingPlace, regionAround } from "./drawingCheck";

/** A sheet drawn to a picture: its URL and size in pixels. */
interface Sheet {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/** About 180 dots an inch on a B-size sheet: a callout reads sharp in a row's crop. */
const SHEET_WIDTH = 3000;

/** Sheets drawn this session, by the PDF's URL and page: each is drawn once, one at a time. */
const sheets = new Map<string, Promise<Sheet>>();
let queue: Promise<unknown> = Promise.resolve();

function drawSheet(url: string, page: number): Promise<Sheet> {
  const key = `${url}#${page}`;
  const known = sheets.get(key);
  if (known !== undefined) return known;
  const drawn = queue.then(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("The drawing could not be read.");
    const task = openPdf(await response.arrayBuffer());
    const document = await task.promise;
    try {
      const sheet = await document.getPage(Math.min(page, document.numPages));
      const at = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({ scale: SHEET_WIDTH / Math.max(at.width, at.height) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("The drawing could not be drawn.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await sheet.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob === null) throw new Error("The drawing could not be drawn.");
      return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
    } finally {
      void task.destroy();
    }
  });
  queue = drawn.catch(() => undefined);
  sheets.set(key, drawn);
  drawn.catch(() => sheets.delete(key));
  return drawn;
}

function useSheet(url: string | null, pdf: boolean, page: number): Sheet | "failed" | null {
  const [sheet, setSheet] = useState<{ readonly key: string; readonly value: Sheet | "failed" }>();
  const key = `${url}#${page}`;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- draws the sheet outside React (pdf.js, or the picture's own size) and keeps it when done
  useEffect(() => {
    if (url === null) return;
    let live = true;
    const done = (value: Sheet | "failed") => {
      if (live) setSheet({ key, value });
    };
    if (pdf) {
      drawSheet(url, page).then(done, () => done("failed"));
    } else {
      const image = new Image();
      image.onload = () => done({ url, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => done("failed");
      image.src = url;
    }
    return () => {
      live = false;
    };
  }, [url, pdf, page, key]);
  return sheet?.key === key ? sheet.value : null;
}

/**
 * The place on the drawing a row was read from: its part of the sheet, the callout outlined in the
 * one blue (a place, not a status), from the PDF or picture in the project.
 */
export function DrawingSheetCrop(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  /** The drawing, relative to `root`. */
  readonly file: string;
  readonly place: DrawingPlace;
  /** Width over height of the crop. */
  readonly aspect: number;
  readonly className?: string;
}) {
  const { place, aspect } = props;
  const absolutePath = `${props.root.replace(/[\\/]+$/, "")}/${props.file}`;
  const resource = workspaceAssetResource({
    kind: "workspace-file",
    threadRef: props.threadRef,
    draft: true,
    workspaceRoot: props.root,
    absolutePath,
  });
  const asset = useAssetUrlState(props.environmentId, resource);
  const pdf = /\.pdf$/i.test(props.file);
  const sheet = useSheet(asset._tag === "Success" ? asset.url : null, pdf, place.page);
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-border bg-white ${props.className ?? ""}`}
      style={{ aspectRatio: String(aspect) }}
    >
      {sheet === null ? (
        <div className="absolute inset-0 bg-muted" />
      ) : sheet === "failed" ? (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
          The drawing could not be shown
        </span>
      ) : (
        <Region sheet={sheet} place={place} aspect={aspect} />
      )}
    </div>
  );
}

function Region(props: {
  readonly sheet: Sheet;
  readonly place: DrawingPlace;
  readonly aspect: number;
}) {
  const { sheet, place } = props;
  const region = regionAround(place.box, sheet, props.aspect);
  // Percentages of the crop, so it scales with its row.
  const across = (value: number) => `${(value / region.width) * 100}%`;
  const down = (value: number) => `${(value / region.height) * 100}%`;
  const box = place.box;
  return (
    <>
      <img
        src={sheet.url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: across(sheet.width),
          left: across(-region.x),
          top: down(-region.y),
        }}
      />
      {box === null ? null : (
        <span
          aria-hidden="true"
          className="absolute rounded-sm ring-2 ring-primary/80"
          style={{
            left: across(box[0] * sheet.width - region.x - 3),
            top: down(box[1] * sheet.height - region.y - 3),
            width: across(box[2] * sheet.width + 6),
            height: down(box[3] * sheet.height + 6),
          }}
        />
      )}
    </>
  );
}
