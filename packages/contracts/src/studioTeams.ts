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
  /** Bytes the team's files take on the hub, and what its plan allows. */
  storageUsed: Schema.Number,
  storageLimit: Schema.Number,
});
export type StudioTeam = typeof StudioTeam.Type;

export const StudioTeamsStatusResult = Schema.Struct({
  /** False when this build names no team hub. */
  available: Schema.Boolean,
  /** The signed-in email, or null. */
  account: Schema.NullOr(Schema.String),
  teams: Schema.Array(StudioTeam),
  /** The browser page where Viewers review, or null when this build has none. */
  reviewPage: Schema.NullOr(Schema.String),
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

/** An Admin deletes a team, with its projects and their files. */
export const StudioTeamsTeamInput = Schema.Struct({ teamId: TrimmedNonEmptyString });
export type StudioTeamsTeamInput = typeof StudioTeamsTeamInput.Type;

/** An Admin deletes a team project and its files; copies on people's computers stay. */
export const StudioTeamsDeleteProjectInput = Schema.Struct({ projectId: TrimmedNonEmptyString });
export type StudioTeamsDeleteProjectInput = typeof StudioTeamsDeleteProjectInput.Type;

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

/** Share link: the project's models and drawings in a browser, for anyone who opens the link. */
export const StudioTeamsShareLinkInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type StudioTeamsShareLinkInput = typeof StudioTeamsShareLinkInput.Type;

export const StudioTeamsShareLinkResult = Schema.Struct({
  url: TrimmedNonEmptyString,
  /** The Version the link shows. */
  version: Schema.Number,
});
export type StudioTeamsShareLinkResult = typeof StudioTeamsShareLinkResult.Type;

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
  /** Replies to the last review's comments, each marked resolved by this new Version. */
  answers: Schema.optional(
    Schema.Array(Schema.Struct({ comment: Schema.String, reply: TrimmedNonEmptyString })),
  ),
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

/** Where a comment points: a file of the Version and, on a model, a spot on it. */
export const StudioTeamPin = Schema.Struct({
  file: Schema.String,
  point: Schema.optional(Schema.Array(Schema.Number)),
});
export type StudioTeamPin = typeof StudioTeamPin.Type;

/** The review of one Version: who was asked, what each decided, and the comments. */
export const StudioTeamReview = Schema.Struct({
  id: Schema.String,
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
    Schema.Struct({
      id: Schema.String,
      by: Schema.String,
      body: Schema.String,
      at: Schema.String,
      pin: Schema.NullOr(StudioTeamPin),
      /** The comment this one answers. */
      replyTo: Schema.NullOr(Schema.String),
      /** The later Version that resolved it. */
      resolvedIn: Schema.NullOr(Schema.Number),
      /** The agent may read it: an Admin's or Editor's, or one an Admin or Editor let it see. */
      agentSees: Schema.Boolean,
    }),
  ),
  /** The browser page where reviewers without Studio review it, or null when this build has none. */
  link: Schema.NullOr(Schema.String),
});
export type StudioTeamReview = typeof StudioTeamReview.Type;

export const StudioTeamsReviewCommentInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  body: TrimmedNonEmptyString,
  replyTo: Schema.optional(Schema.String),
});
export type StudioTeamsReviewCommentInput = typeof StudioTeamsReviewCommentInput.Type;

export const StudioTeamsReviewDecideInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  decision: StudioTeamReviewDecision,
});
export type StudioTeamsReviewDecideInput = typeof StudioTeamsReviewDecideInput.Type;

/** A comment someone pressed Fix this on in the hub, which the agent may read; oldest first. */
export const StudioTeamFixComment = Schema.Struct({
  id: Schema.String,
  /** The Version it was written on. */
  version: Schema.Number,
  by: Schema.String,
  body: Schema.String,
  at: Schema.String,
  pin: Schema.NullOr(StudioTeamPin),
  /** Who pressed Fix this. */
  queuedBy: Schema.String,
});
export type StudioTeamFixComment = typeof StudioTeamFixComment.Type;

/** One thing that happened to a team project, for its activity list. */
export const StudioTeamActivity = Schema.Struct({
  kind: Schema.Literals(["check-in", "review-asked", "approved", "changes", "comment", "released"]),
  by: Schema.String,
  at: Schema.String,
  version: Schema.Number,
  /** The check-in note, the comment, or the revision letter. */
  text: Schema.NullOr(Schema.String),
});
export type StudioTeamActivity = typeof StudioTeamActivity.Type;

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
    /** The latest review before the current Version's, which a new Version may answer. */
    previousReview: Schema.NullOr(StudioTeamReview),
    /** Newest first. */
    activity: Schema.Array(StudioTeamActivity),
    /** Comments queued in the hub for the agent to fix, not yet resolved by a Version. */
    fixQueue: Schema.Array(StudioTeamFixComment),
    /** The project's page in the hub, or null when this build has none. */
    hubLink: Schema.NullOr(Schema.String),
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
    "storage-full",
    "too-many-teams",
    "not-found",
    "hub",
    "local",
  ]),
  message: Schema.String,
  by: Schema.optional(Schema.String),
}) {}
