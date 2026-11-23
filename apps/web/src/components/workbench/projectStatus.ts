import type { CheckResult } from "./checkResults";

/**
 * What the Overview's status strip says of a project: how its checks went, counted from the results
 * its runs wrote (`checkResults.ts`), and how many of its chats wait on the person. Nothing is
 * counted that no run wrote: a project with no results says it was not checked.
 */
export interface ProjectStatus {
  readonly failed: number;
  readonly warnings: number;
  readonly passed: number;
  /** Some check has run on the project's parts. */
  readonly checked: boolean;
  readonly waiting: number;
}

export function projectStatus(input: {
  readonly results: ReadonlyArray<CheckResult>;
  readonly waiting: number;
}): ProjectStatus {
  const count = (status: CheckResult["status"]) =>
    input.results.filter((result) => result.status === status).length;
  return {
    failed: count("fix"),
    warnings: count("warnings"),
    passed: count("ready"),
    checked: input.results.length > 0,
    waiting: input.waiting,
  };
}

/**
 * A count in words: "1 check failed", "2 warnings", "3 passed". None at all when no check ran: the
 * lead part says so once, with a way to run one (`LeadPart`), so the strip shows only real results.
 */
export function statusWords(status: ProjectStatus): ReadonlyArray<{
  readonly tone: "failed" | "warning" | "passed";
  readonly text: string;
}> {
  if (!status.checked) return [];
  return [
    ...(status.failed === 0
      ? []
      : [
          {
            tone: "failed" as const,
            text: `${status.failed} ${status.failed === 1 ? "check" : "checks"} failed`,
          },
        ]),
    ...(status.warnings === 0
      ? []
      : [
          {
            tone: "warning" as const,
            text: `${status.warnings} ${status.warnings === 1 ? "warning" : "warnings"}`,
          },
        ]),
    ...(status.passed === 0 ? [] : [{ tone: "passed" as const, text: `${status.passed} passed` }]),
  ];
}
