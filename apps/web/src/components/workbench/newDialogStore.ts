import { create } from "zustand";

import type { Discipline } from "./newTemplates";

/** New asked for from outside it: on a discipline, else the first; on a template, else its first. */
export interface NewRequest {
  readonly discipline: Discipline | null;
  readonly templateId: string | null;
  /** For a new project (⌘K's and the project switcher's New project): only Home's or the Projects page's New takes it. */
  readonly newProject: boolean;
}

/**
 * Opens New from outside it (`NewDialog`). A request is used once: the first New that may take it
 * (`StudioNew`, or `ProjectPage` with code tools on) moves it into its own open state, so nothing
 * is left for a New mounted later.
 */
export const useNewDialogStore = create<{
  /** The request no New has taken yet. */
  readonly request: NewRequest | null;
  readonly ask: (discipline?: Discipline, templateId?: string) => void;
  /** New for a new project, on its first template. */
  readonly askNewProject: () => void;
  /**
   * Hands the request over and clears it: null when there is none, another New took it, or it is
   * for a new project and this New (`newProject` false) makes none.
   */
  readonly take: (newProject: boolean) => NewRequest | null;
}>()((set, get) => ({
  request: null,
  ask: (discipline, templateId) =>
    set({
      request: {
        discipline: discipline ?? null,
        templateId: templateId ?? null,
        newProject: false,
      },
    }),
  askNewProject: () => set({ request: { discipline: null, templateId: null, newProject: true } }),
  take: (newProject) => {
    const { request } = get();
    if (request === null || (request.newProject && !newProject)) return null;
    set({ request: null });
    return request;
  },
}));
