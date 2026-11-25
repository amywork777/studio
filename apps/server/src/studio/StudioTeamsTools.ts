/**
 * Studio Teams' agent tools on T3's MCP server: read the team review of a project's latest
 * Version, and check the project in as the next Version once the agent has addressed it,
 * answering each comment. Only thread callers may call them: a check-in is the person's own, made
 * through their sign-in, so an outside MCP client with no thread has no person to act for.
 */
import { type StudioTeamReview, StudioTeamsError } from "@t3tools/contracts";
import { McpSchema } from "effect/ai";
import type { McpServer } from "effect/ai";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as StudioTeams from "./StudioTeams.ts";

type AddTool = McpServer.McpServer["Service"]["addTool"];

const decodeTool = Schema.decodeUnknownEffect(McpSchema.Tool);

const result = (value: unknown, isError = false) =>
  new McpSchema.CallToolResult({
    isError,
    content: [
      { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  });

const refuse = (message: string) => new StudioTeamsError({ reason: "not-allowed", message });

const ReviewArgs = Schema.Struct({ folder: Schema.String });
const CheckInArgs = Schema.Struct({
  folder: Schema.String,
  note: Schema.String,
  answers: Schema.optional(
    Schema.Array(Schema.Struct({ comment: Schema.String, reply: Schema.String })),
  ),
  askReview: Schema.optional(Schema.Boolean),
});

const decodeReviewArgs = Schema.decodeUnknownEffect(ReviewArgs);
const decodeCheckInArgs = Schema.decodeUnknownEffect(CheckInArgs);

const FOLDER = {
  type: "string",
  description: "The team project's folder: the absolute path of this thread's project.",
};

const TOOLS = [
  {
    name: "studio_team_review",
    description:
      "Read where the team review of a Studio team project's latest Version stands: each reviewer's decision, and each comment's id, author, the file it points at and whether it is answered. It never gives a comment's words: the person hands you the comments they chose, quoted, in their message.",
    inputSchema: { type: "object", properties: { folder: FOLDER }, required: ["folder"] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "studio_team_check_in",
    description:
      "Check a Studio team project in as its next Version after you changed it to address its review, only when the person asked you to. Checks it out first when nobody has it. `answers` replies to each comment you addressed, by id, saying what you changed with numbers, and marks it resolved by the new Version. `askReview` (default true) asks the same reviewers to review the new Version.",
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        note: { type: "string", description: "What changed, in a short engineer's line." },
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              comment: { type: "string", description: "The comment's id." },
              reply: { type: "string", description: "What you did about it." },
            },
            required: ["comment", "reply"],
          },
        },
        askReview: { type: "boolean" },
      },
      required: ["folder", "note"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
] as const;

/**
 * A review without its comments' words. Reviewers include customers, so what they wrote reaches
 * the agent only when the person picks it and hands it over (ReviewPanel), never by a tool call.
 */
const withoutWords = (review: StudioTeamReview | null) =>
  review === null
    ? null
    : {
        ...review,
        comments: review.comments.map(({ body: _body, ...comment }) => comment),
      };

/** Adds the Teams tools when this server runs Studio Teams; test servers without it get none. */
export const register = Effect.fn("StudioTeamsTools.register")(function* (addTool: AddTool) {
  const service = yield* Effect.serviceOption(StudioTeams.StudioTeams);
  if (Option.isNone(service)) return;
  const teams = service.value;

  const asThread =
    <A>(work: (payload: unknown) => Effect.Effect<A, StudioTeamsError>) =>
    (payload: unknown) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getOption(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        if (Option.isNone(invocation) || invocation.value.thread === undefined) {
          return Effect.succeed(result("Studio Teams tools run inside a Studio chat.", true));
        }
        return work(payload).pipe(
          Effect.map((value) => result(value)),
          Effect.catch((error) => Effect.succeed(result(error.message, true))),
        );
      });

  const review = asThread((payload) =>
    Effect.gen(function* () {
      const { folder } = yield* decodeReviewArgs(payload).pipe(
        Effect.mapError(() => refuse("Give the project's `folder`.")),
      );
      const status = yield* teams.folderStatus({ cwd: folder });
      if (status === null) return "This folder is not a team project.";
      return {
        project: status.project.name,
        team: status.project.teamName,
        latestVersion: status.project.version,
        checkedOutBy: status.project.checkedOutBy,
        checkedOutToYou: status.mine,
        review: withoutWords(status.review),
        previousReview: withoutWords(status.previousReview),
      };
    }),
  );

  const checkIn = asThread((payload) =>
    Effect.gen(function* () {
      const args = yield* decodeCheckInArgs(payload).pipe(
        Effect.mapError(() => refuse("Give the project's `folder` and a `note`.")),
      );
      const status = yield* teams.folderStatus({ cwd: args.folder });
      if (status === null) return yield* refuse("This folder is not a team project.");
      if (!status.mine) yield* teams.checkOut({ cwd: args.folder });
      const reviewers =
        args.askReview === false
          ? []
          : ((status.review ?? status.previousReview)?.people.map((person) => person.email) ?? []);
      const answers = (args.answers ?? []).filter((answer) => answer.reply.trim() !== "");
      const done = yield* teams.checkIn({
        cwd: args.folder,
        note: args.note,
        keep: false,
        reviewers,
        answers,
      });
      return {
        version: done?.project.version ?? null,
        askedToReview: reviewers,
        answered: answers.length,
      };
    }),
  );

  const handles = { studio_team_review: review, studio_team_check_in: checkIn };
  for (const definition of TOOLS) {
    const tool = yield* decodeTool(definition).pipe(Effect.option);
    if (Option.isNone(tool)) continue;
    yield* addTool({
      tool: tool.value,
      annotations: Context.empty(),
      handle: handles[definition.name],
    });
  }
});
