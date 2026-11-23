import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { toastManager } from "../ui/toast";
import { handToChat, sendsAtOnce, sendViewMessage } from "./handToChat";

/** A composer holding `draft`, keeping what is written into it and whether it was sent. */
function composer(draft: string, accepts = true) {
  const state = { value: draft, sent: false };
  const handle = {
    readSnapshot: () => ({ value: state.value, cursor: 0, expandedCursor: 0, contextIds: [] }),
    insertTextAtEnd: (text: string) => {
      if (!accepts) return false;
      state.value = state.value === "" ? text : `${state.value} ${text}`;
      return true;
    },
    submit: () => {
      state.sent = true;
    },
  };
  return { state, ref: { current: handle } as unknown as ComposerHandleRef };
}

describe("handing a job to the chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends at once into an empty composer, and waits after a draft", () => {
    expect(sendsAtOnce("")).toBe(true);
    expect(sendsAtOnce("  \n ")).toBe(true);
    expect(sendsAtOnce("make the wall")).toBe(false);
  });

  it("sends the job alone when nothing was being written", () => {
    vi.stubGlobal("requestAnimationFrame", (step: () => void) => step());
    const { state, ref } = composer("");
    handToChat(ref, "Run FEA on bracket.step");
    expect(state).toEqual({ value: "Run FEA on bracket.step", sent: true });
  });

  it("adds the job after a half-written draft and leaves both for the person to send", () => {
    vi.stubGlobal("requestAnimationFrame", (step: () => void) => step());
    const { state, ref } = composer("make the wall 3 mm and");
    handToChat(ref, "Run FEA on bracket.step");
    expect(state).toEqual({ value: "make the wall 3 mm and Run FEA on bracket.step", sent: false });
  });

  it("sends nothing when the composer could not take the job, and says why", () => {
    vi.stubGlobal("requestAnimationFrame", (step: () => void) => step());
    const add = vi.spyOn(toastManager, "add");
    const { state, ref } = composer("", false);
    handToChat(ref, "Run FEA on bracket.step");
    expect(state.sent).toBe(false);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "The chat is waiting on you" }),
    );
  });

  it("starts the turn from a view's Send, with what the view queued in the composer", () => {
    const { state, ref } = composer("File: part.step References: face 1");
    sendViewMessage(ref, "Fillet this edge 2 mm");
    expect(state).toEqual({
      value: "File: part.step References: face 1 Fillet this edge 2 mm",
      sent: true,
    });
  });

  it("refuses a view's Send the chat cannot take now, so the view says so", () => {
    const { state, ref } = composer("", false);
    expect(() => sendViewMessage(ref, "Fillet this edge 2 mm")).toThrow(
      "The chat is waiting on you",
    );
    expect(state.sent).toBe(false);
  });
});
