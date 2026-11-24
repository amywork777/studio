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
 * A count of checks in words: "1 check failed", "2 checks with warnings", "3 passed". None at all when no check ran: the
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
            text: `${status.warnings} ${status.warnings === 1 ? "check" : "checks"} with warnings`,
          },
        ]),
    ...(status.passed === 0 ? [] : [{ tone: "passed" as const, text: `${status.passed} passed` }]),
  ];
}

/**
 * A Home tile's one badge from its project's check results, the worst first: "Failed: Strength"
 * or "Passes with warnings: Printing", the verdict ahead of a check's name, which can be a long
 * study's ("Strength, 15 kg on the shelf flange…") cut at the tile's edge; counted where several checks share it ("2 checks failed").
 * Null when every check passed or none ran: a tile says only what needs a look.
 */
export function tileCheckBadge(
  results: ReadonlyArray<Pick<CheckResult, "check" | "status">>,
): { readonly tone: "failed" | "warning"; readonly text: string } | null {
  const failed = results.filter((result) => result.status === "fix");
  if (failed.length > 0) {
    return {
      tone: "failed",
      text: failed.length === 1 ? `Failed: ${failed[0]!.check}` : `${failed.length} checks failed`,
    };
  }
  const warned = results.filter((result) => result.status === "warnings");
  if (warned.length > 0) {
    return {
      tone: "warning",
      text:
        warned.length === 1
          ? `Passes with warnings: ${warned[0]!.check}`
          : `${warned.length} checks pass with warnings`,
    };
  }
  return null;
}
