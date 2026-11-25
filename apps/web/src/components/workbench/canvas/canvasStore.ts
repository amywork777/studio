import { create } from "zustand";

import type { Place } from "./canvasOptions";

/** Something put on the board to make options from: a picture (a sketch, a photo, a drawing). */
export interface CanvasPicture {
  readonly id: string;
  readonly name: string;
  /** Where it is on this computer, to copy into the project; null for a pasted picture. */
  readonly path: string | null;
  /** A small copy to draw on the board (a data URL). */
  readonly preview: string;
  readonly place: Place;
}

/**
 * A board: what was put on it, and once options are asked for, the project they are made in and
 * the chat making them. The options themselves are the project's files (`canvasOptions.ts`).
 */
export interface CanvasBoard {
  readonly id: string;
  readonly name: string;
  readonly environmentId: string;
  readonly createdAt: string;
  readonly description: string;
  readonly pictures: ReadonlyArray<CanvasPicture>;
  readonly folder: string | null;
  readonly projectId: string | null;
  readonly threadId: string | null;
  /** Cards the person moved, by option letter or picture id. */
  readonly moved: Readonly<Record<string, Place>>;
  /** The board's pan and zoom when last left. */
  readonly view: { readonly x: number; readonly y: number; readonly zoom: number };
}

interface CanvasState {
  readonly boards: ReadonlyArray<CanvasBoard>;
  readonly current: string | null;
  readonly startBoard: (environmentId: string) => string;
  readonly open: (id: string) => void;
  readonly update: (id: string, change: (board: CanvasBoard) => Partial<CanvasBoard>) => void;
  readonly remove: (id: string) => void;
}

const KEY = "studio.canvas.v1";

function loadBoards(): Pick<CanvasState, "boards" | "current"> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return { boards: [], current: null };
    const parsed = JSON.parse(raw) as { boards?: CanvasBoard[]; current?: string | null };
    return {
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      current: typeof parsed.current === "string" ? parsed.current : null,
    };
  } catch {
    return { boards: [], current: null };
  }
}

function saveBoards(state: Pick<CanvasState, "boards" | "current">) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ boards: state.boards, current: state.current }),
    );
  } catch {
    // A private window or a full store keeps the board for this session only.
  }
}

/**
 * The boards on this device. A prototype keeps them here: what they make is a real project, so a
 * board lost with the browser's storage loses only where its cards sat.
 */
export const useCanvasStore = create<CanvasState>()((set, get) => {
  const commit = (next: Pick<CanvasState, "boards" | "current">) => {
    set(next);
    saveBoards(next);
  };
  return {
    ...loadBoards(),
    startBoard: (environmentId) => {
      const id = `board-${Date.now().toString(36)}`;
      const board: CanvasBoard = {
        id,
        name: "Untitled canvas",
        environmentId,
        createdAt: new Date().toISOString(),
        description: "",
        pictures: [],
        folder: null,
        projectId: null,
        threadId: null,
        moved: {},
        view: { x: 0, y: 0, zoom: 1 },
      };
      commit({ boards: [board, ...get().boards], current: id });
      return id;
    },
    open: (id) => commit({ boards: get().boards, current: id }),
    update: (id, change) =>
      commit({
        boards: get().boards.map((board) =>
          board.id === id ? { ...board, ...change(board) } : board,
        ),
        current: get().current,
      }),
    remove: (id) => {
      const boards = get().boards.filter((board) => board.id !== id);
      commit({ boards, current: get().current === id ? (boards[0]?.id ?? null) : get().current });
    },
  };
});

/** A picture made small enough to keep on the board: its longest side at most `side` pixels. */
export async function previewOf(file: Blob, side = 480): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
