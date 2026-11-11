import type { ChatComposerHandle } from "../chat/ChatComposer";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A picture's file name from its title ("CAD view · bracket.step" is `cad-view-bracket-step.png`). */
export function viewImageName(title: unknown, index: number): string {
  const slug =
    typeof title === "string"
      ? title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60)
      : "";
  return `${slug || `view-${index + 1}`}.png`;
}

/** What a view adds to the chat, split into the composer's text and its attachments. */
export function readViewContext(content: ReadonlyArray<unknown>): {
  readonly text: string;
  readonly images: ReadonlyArray<{
    readonly name: string;
    readonly data: string;
    readonly mimeType: string;
  }>;
  /** A note of a change made by hand in the view ("Hand edit · bracket.py"), not a request. */
  readonly handEdit: boolean;
} {
  let handEdit = false;
  const texts: string[] = [];
  const images: Array<{ name: string; data: string; mimeType: string }> = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      texts.push(block.text.trim());
      const meta = isRecord(block._meta) ? block._meta : {};
      const title = meta["openai/title"];
      if (typeof title === "string" && /^hand edit\b/i.test(title.trim())) handEdit = true;
    } else if (block.type === "image" && typeof block.data === "string") {
      const meta = isRecord(block._meta) ? block._meta : {};
      images.push({
        name: viewImageName(meta["openai/title"], images.length),
        data: block.data,
        mimeType: typeof block.mimeType === "string" ? block.mimeType : "image/png",
      });
    }
  }
  return { text: texts.join("\n\n"), images, handEdit };
}

/**
 * Puts what the viewer added (its "Add to chat": the person's words, the file
 * and the references they picked, a picture of the view) into the composer,
 * where it can be read and edited before it goes to the agent. A note of a hand
 * edit goes in quietly: the keyboard stays in the view, where the person is
 * still working, and a view filling the window stays as it is. Returns that
 * note when one went in, so the chat can say what it is (`handEditNoteShown`).
 */
export function addViewContextToComposer(
  composer: ChatComposerHandle | null,
  content: ReadonlyArray<unknown>,
): string | null {
  if (composer === null) return null;
  const { text, images, handEdit } = readViewContext(content);
  let note: string | null = null;
  if (text !== "") {
    const inserted = composer.insertTextAtEnd(text, {
      ensureLeadingBoundary: true,
      stayHidden: handEdit,
    });
    if (inserted && handEdit) note = text;
  }
  if (images.length > 0) {
    composer.addDroppedFiles(
      images.map(
        (image) =>
          new File([Uint8Array.from(atob(image.data), (char) => char.charCodeAt(0))], image.name, {
            type: image.mimeType,
          }),
      ),
    );
  }
  if (!handEdit) composer.focusAtEnd();
  return note;
}

/**
 * Whether the message box still holds one of the hand-edit notes written into it: while it does,
 * the chat says the notes go to the AI with the next message, so there is nothing to send or
 * delete. Sending the message, or deleting the notes, ends it.
 */
export function handEditNoteShown(prompt: string, notes: ReadonlyArray<string>): boolean {
  return notes.some((note) => prompt.includes(note));
}
