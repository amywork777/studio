// Studio Teams: a team's shared projects on Studio's team hub (`infra/teams`), each checked out to
// one person at a time and checked in as a new Version, the way a CAD vault works.
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { StudioProjectBrief } from "./studioProjects.ts";

/** Admins manage the team and its seats; Editors check out and in; Viewers look, free. */
export const StudioTeamRole = Schema.Literals(["admin", "editor", "viewer"]);
export type StudioTeamRole = typeof StudioTeamRole.Type;

export const StudioTeamPerson = Schema.Struct({ email: Schema.String, role: StudioTeamRole });
export type StudioTeamPerson = typeof StudioTeamPerson.Type;

export const StudioTeam = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: Schema.String,
  /** The caller's own role. */
  role: StudioTeamRole,
  /** Paid seats: Admins and Editors, invited or joined. */
  seats: Schema.Number,
  members: Schema.Array(StudioTeamPerson),
  /** Invited and not signed in yet; only an Admin sees them. */
  invites: Schema.Array(StudioTeamPerson),
});
export type StudioTeam = typeof StudioTeam.Type;

export const StudioTeamsStatusResult = Schema.Struct({
  /** False when this build names no team hub. */
  available: Schema.Boolean,
  /** The signed-in email, or null. */
  account: Schema.NullOr(Schema.String),
  teams: Schema.Array(StudioTeam),
});
export type StudioTeamsStatusResult = typeof StudioTeamsStatusResult.Type;

export const StudioTeamsSignInStartInput = Schema.Struct({ email: TrimmedNonEmptyString });
export type StudioTeamsSignInStartInput = typeof StudioTeamsSignInStartInput.Type;

export const StudioTeamsSignInCheckInput = Schema.Struct({
  email: TrimmedNonEmptyString,
  code: TrimmedNonEmptyString,
});
export type StudioTeamsSignInCheckInput = typeof StudioTeamsSignInCheckInput.Type;

export const StudioTeamsCreateInput = Schema.Struct({ name: TrimmedNonEmptyString });
export type StudioTeamsCreateInput = typeof StudioTeamsCreateInput.Type;

export const StudioTeamsInviteInput = Schema.Struct({
  teamId: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString,
  role: StudioTeamRole,
});
export type StudioTeamsInviteInput = typeof StudioTeamsInviteInput.Type;

/** Takes someone off a team or withdraws their invite; anyone may take themselves off. */
export const StudioTeamsRemoveInput = Schema.Struct({
  teamId: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString,
});
export type StudioTeamsRemoveInput = typeof StudioTeamsRemoveInput.Type;

/** A team project as the hub keeps it. */
export const StudioTeamProject = Schema.Struct({
  id: TrimmedNonEmptyString,
  teamId: TrimmedNonEmptyString,
  teamName: Schema.String,
  name: Schema.String,
  /** The latest checked-in Version, 0 before the first check-in. */
  version: Schema.Number,
  /** Who has it checked out, or null. */
  checkedOutBy: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
export type StudioTeamProject = typeof StudioTeamProject.Type;

export const StudioTeamsProjectsResult = Schema.Struct({
  projects: Schema.Array(StudioTeamProject),
});
export type StudioTeamsProjectsResult = typeof StudioTeamsProjectsResult.Type;

export const StudioTeamsShareInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  teamId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type StudioTeamsShareInput = typeof StudioTeamsShareInput.Type;

/** Brings a team project to this computer as a new project folder. */
export const StudioTeamsGetInput = Schema.Struct({ projectId: TrimmedNonEmptyString });
export type StudioTeamsGetInput = typeof StudioTeamsGetInput.Type;

export const StudioTeamsGetResult = Schema.Struct({
  folder: TrimmedNonEmptyString,
  name: Schema.String,
  brief: Schema.NullOr(StudioProjectBrief),
});
export type StudioTeamsGetResult = typeof StudioTeamsGetResult.Type;

export const StudioTeamsFolderInput = Schema.Struct({ cwd: TrimmedNonEmptyString });
export type StudioTeamsFolderInput = typeof StudioTeamsFolderInput.Type;

export const StudioTeamsCheckInInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  /** What changed, in the engineer's words; shown in the project's check-ins. */
  note: Schema.String,
  /** Keep it checked out after this check-in. */
  keep: Schema.Boolean,
  /** Teammates' emails to ask to review the new Version; none asks for no review. */
  reviewers: Schema.optional(Schema.Array(Schema.String)),
});
export type StudioTeamsCheckInInput = typeof StudioTeamsCheckInInput.Type;

export const StudioTeamCheckIn = Schema.Struct({
  version: Schema.Number,
  by: Schema.String,
  note: Schema.NullOr(Schema.String),
  at: Schema.String,
  /** The revision letter this Version was released as, or null. */
  releasedRev: Schema.NullOr(Schema.String),
});
export type StudioTeamCheckIn = typeof StudioTeamCheckIn.Type;

export const StudioTeamReviewDecision = Schema.Literals(["approved", "changes"]);
export type StudioTeamReviewDecision = typeof StudioTeamReviewDecision.Type;

/** The review of one Version: who was asked, what each decided, and the comments. */
export const StudioTeamReview = Schema.Struct({
  version: Schema.Number,
  requestedBy: Schema.String,
  /** Released once an Admin releases it; until then it follows the reviewers' decisions. */
  status: Schema.Literals(["review", "changes", "approved", "released"]),
  releasedRev: Schema.NullOr(Schema.String),
  people: Schema.Array(
    Schema.Struct({ email: Schema.String, decision: Schema.NullOr(StudioTeamReviewDecision) }),
  ),
  /** Oldest first. */
  comments: Schema.Array(
    Schema.Struct({ id: Schema.String, by: Schema.String, body: Schema.String, at: Schema.String }),
  ),
});
export type StudioTeamReview = typeof StudioTeamReview.Type;

export const StudioTeamsReviewCommentInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  body: TrimmedNonEmptyString,
});
export type StudioTeamsReviewCommentInput = typeof StudioTeamsReviewCommentInput.Type;

export const StudioTeamsReviewDecideInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  decision: StudioTeamReviewDecision,
});
export type StudioTeamsReviewDecideInput = typeof StudioTeamsReviewDecideInput.Type;

/** A folder's place on its team: null when it is not a team project. */
export const StudioTeamsFolderStatusResult = Schema.NullOr(
  Schema.Struct({
    project: StudioTeamProject,
    role: StudioTeamRole,
    /** The Version this folder holds. */
    localVersion: Schema.Number,
    /** Checked out to the person signed in here. */
    mine: Schema.Boolean,
    /** Work here that is not checked in. */
    changesHere: Schema.Boolean,
    /** Latest first. */
    checkIns: Schema.Array(StudioTeamCheckIn),
    /** The latest Version's review, or null when nobody was asked to review it. */
    review: Schema.NullOr(StudioTeamReview),
  }),
);
export type StudioTeamsFolderStatusResult = typeof StudioTeamsFolderStatusResult.Type;

/** A team call stopped. The message is shown to the person as it is. */
export class StudioTeamsError extends Schema.TaggedError<StudioTeamsError>()("StudioTeamsError", {
  /** `by` names who holds a `checked-out` project; `local` is this computer's copy failing. */
  reason: Schema.Literals([
    "unavailable",
    "signed-out",
    "code",
    "not-allowed",
    "seats-full",
    "checked-out",
    "changed-elsewhere",
    "changes-here",
    "last-admin",
    "not-found",
    "hub",
    "local",
  ]),
  message: Schema.String,
  by: Schema.optional(Schema.String),
}) {}
