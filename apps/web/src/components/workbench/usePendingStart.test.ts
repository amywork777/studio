import { describe, expect, it } from "vite-plus/test";

import { sendStep } from "./usePendingStart";

const box = { attaching: false, holds: true, agent: true } as const;

describe("what pressing Send on a new project's first message comes to", () => {
  it("presses while the chat holds the message and an agent can take it", () => {
    expect(sendStep(box)).toBe("press");
  });

  it("waits while the chat still reads its files", () => {
    expect(sendStep({ ...box, attaching: true })).toBe("wait");
    expect(sendStep({ ...box, attaching: true, agent: false })).toBe("wait");
  });

  it("is done once the message is sent, or changed by the person", () => {
    expect(sendStep({ ...box, holds: false })).toBe("done");
    expect(sendStep({ ...box, holds: false, agent: false })).toBe("done");
  });

  it("is blocked, not pressed again, with no AI agent to send to", () => {
    expect(sendStep({ ...box, agent: false })).toBe("blocked");
  });

  it("still presses while the agents are not known yet", () => {
    expect(sendStep({ ...box, agent: null })).toBe("press");
  });
});
