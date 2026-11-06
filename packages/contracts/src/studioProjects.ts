import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * What a hardware project is for, as its engineer sets it: every field is
 * free text but units, and an empty string is "not said yet".
 */
export const StudioProjectBrief = Schema.Struct({
  purpose: Schema.String,
  requirements: Schema.String,
  units: Schema.Literals(["mm", "in"]),
  material: Schema.String,
  process: Schema.String,
  quantity: Schema.String,
  links: Schema.String,
  notes: Schema.String,
});
export type StudioProjectBrief = typeof StudioProjectBrief.Type;

/**
 * A Studio project: a named grouping of folders (each an ordinary project's
 * workspace root) with one brief. A thread in any of its folders works in all
 * of them, the way a coding agent takes extra working directories, and reads
 * the brief first (`packages/shared/src/studioProjects.ts`). Each project is
 * a folder of its own in Studio's projects folder (below).
 */
export const StudioProject = Schema.Struct({
  name: TrimmedNonEmptyString,
  /** The kind it started as (`part`, `product`, `board`, `robot`); null for none. */
  template: Schema.NullOr(Schema.String),
  brief: StudioProjectBrief,
  /** Absolute folder paths, in the order shown; new threads start in the first. */
  folders: Schema.Array(Schema.String),
  /** Each folder's git remote by path, where it has one: how a teammate gets a folder they lack. */
  remotes: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  createdAt: Schema.String,
});
export type StudioProject = typeof StudioProject.Type;

/** A project in Trash: kept whole until it is restored or deleted forever, with when it went. */
export const StudioTrashedProject = Schema.Struct({
  ...StudioProject.fields,
  trashedAt: Schema.String,
});
export type StudioTrashedProject = typeof StudioTrashedProject.Type;

/**
 * Where Studio keeps its projects: one folder per project (`<root>/<id>/`)
 * holding its `project.json` and a README, and each folder its own git
 * repository, so every change to a project is a commit and pushing that one
 * repository shares that one project.
 */
export const StudioProjectsListInput = Schema.Struct({});
export type StudioProjectsListInput = typeof StudioProjectsListInput.Type;

export const StudioProjectsListResult = Schema.Struct({
  /** The folder that holds the project folders, on the server's machine. */
  folder: Schema.String,
  /** Whether git is available, so each project is its own repository that Studio commits to. */
  git: Schema.Boolean,
  projects: Schema.Record(TrimmedNonEmptyString, StudioProject),
  /**
   * The projects in Trash (`<root>/.trash/<id>/`) by id: out of every list until restored. Absent
   * from a server older than Trash, which has none.
   */
  trashed: Schema.optionalKey(Schema.Record(TrimmedNonEmptyString, StudioTrashedProject)),
});
export type StudioProjectsListResult = typeof StudioProjectsListResult.Type;

export const StudioProjectsSaveInput = Schema.Struct({
  /** The project's id (its file name); null for a new project, which gets one from its name. */
  id: Schema.NullOr(TrimmedNonEmptyString),
  /** The project whole. A project is taken out through Trash (`StudioProjectsTrashInput`). */
  project: StudioProject,
});
export type StudioProjectsSaveInput = typeof StudioProjectsSaveInput.Type;

export const StudioProjectsSaveResult = Schema.Struct({
  ...StudioProjectsListResult.fields,
  /** The id saved, or moved to or from Trash. */
  id: TrimmedNonEmptyString,
});
export type StudioProjectsSaveResult = typeof StudioProjectsSaveResult.Type;

/**
 * Trash, by id: `trash` moves a project there, `restore` brings it back under the same id, and
 * `purge` deletes its record there forever. None of them touches the project's work folders.
 */
export const StudioProjectsTrashInput = Schema.Struct({
  id: TrimmedNonEmptyString,
  action: Schema.Literals(["trash", "restore", "purge"]),
});
export type StudioProjectsTrashInput = typeof StudioProjectsTrashInput.Type;

/** Reading the projects folder, or writing or removing a project, failed. */
export class StudioProjectsError extends Schema.TaggedError<StudioProjectsError>()(
  "StudioProjectsError",
  {
    /**
     * `invalid-id`: the id is not one folder name, or a trash or purge named no project there (a
     * restore: none in Trash, or one already under that id). `in-trash`: a save named a project
     * in Trash. `remove`: Trash's record could not be deleted.
     */
    failure: Schema.Literals(["read", "write", "remove", "invalid-id", "in-trash"]),
    /** The projects folder. */
    folder: Schema.String,
    id: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.failure) {
      case "read":
        return `Could not read the projects in ${this.folder}.`;
      case "write":
        return `Could not save the project "${this.id ?? ""}" in ${this.folder}.`;
      case "remove":
        return `Could not delete the project "${this.id ?? ""}" from Trash in ${this.folder}.`;
      case "invalid-id":
        return "That project id is not a folder name Studio can use.";
      case "in-trash":
        return `The project "${this.id ?? ""}" is in Trash. Restore it to change it.`;
    }
  }
}

/**
 * Sends one work folder to its private online copy, every Version with it. `repository` is the
 * `owner/name` of that copy: made when the folder has none, and refused when the folder already
 * goes somewhere else.
 */
export const StudioSyncSendInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
});
export type StudioSyncSendInput = typeof StudioSyncSendInput.Type;

export const StudioSyncSendResult = Schema.Struct({
  repository: TrimmedNonEmptyString,
  /** False when the online copy already had everything, so nothing went. */
  sent: Schema.Boolean,
});
export type StudioSyncSendResult = typeof StudioSyncSendResult.Type;

export const StudioSyncStatusInput = Schema.Struct({ cwd: TrimmedNonEmptyString });
export type StudioSyncStatusInput = typeof StudioSyncStatusInput.Type;

export const StudioSyncStatusResult = Schema.Struct({
  /** The online copy Studio made for this folder, if it made one. */
  repository: Schema.NullOr(TrimmedNonEmptyString),
  /** Whether the online copy holds everything here. Out of reach counts as not. */
  synced: Schema.Boolean,
});
export type StudioSyncStatusResult = typeof StudioSyncStatusResult.Type;

/** A send or a receive stopped. The message is shown to the person as it is. */
export class StudioSyncError extends Schema.TaggedError<StudioSyncError>()("StudioSyncError", {
  /**
   * `no-history`: the folder has no Versions. `other-copy`: it already goes somewhere else.
   * `too-large`: a file in the project is over the limit; `too-large-version`: one in a Version
   * is. `make-copy`: the online copy could not be made. `sign-in`: no credential, or it was
   * refused. `changed-elsewhere`: the online copy moved, and nothing forces it back. `prepare`:
   * git failed on this computer. `send` and `receive`: the transfer failed.
   */
  failure: Schema.Literals([
    "no-history",
    "other-copy",
    "too-large",
    "too-large-version",
    "make-copy",
    "sign-in",
    "changed-elsewhere",
    "prepare",
    "send",
    "receive",
  ]),
  /** The work folder. */
  cwd: Schema.String,
  /** The file over the limit, as a path in the project. */
  file: Schema.optional(Schema.String),
  bytes: Schema.optional(Schema.Number),
  limitBytes: Schema.optional(Schema.Number),
  exitCode: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    const size = (bytes: number | undefined) => `${((bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`;
    switch (this.failure) {
      case "no-history":
        return "This folder has no Versions to send yet.";
      case "other-copy":
        return "This folder already syncs somewhere else, so Studio leaves it alone.";
      case "too-large":
        return `${this.file ?? "A file"} is ${size(this.bytes)}. One file can be at most ${size(this.limitBytes)}, so nothing was sent.`;
      case "too-large-version":
        return `An earlier Version holds ${this.file ?? "a file"} at ${size(this.bytes)}. One file can be at most ${size(this.limitBytes)}, so nothing was sent.`;
      case "make-copy":
        return "The private copy could not be made.";
      case "sign-in":
        return "Sign in with GitHub to send this project.";
      case "changed-elsewhere":
        return "The online copy has changes from somewhere else, so this project is Not synced. Nothing here was lost.";
      case "prepare":
        return "Studio could not get this project ready to send.";
      case "send":
        return "The project could not be sent, so it is Not synced. Nothing here was lost.";
      case "receive":
        return "Studio could not bring this project back.";
    }
  }
}
