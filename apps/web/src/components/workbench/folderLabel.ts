import type { ExecutionEnvironmentPlatformOs } from "@t3tools/contracts";

/**
 * Show a folder or a file where it is on disk, by the file manager's own name on the computer the
 * project is on: Finder on a Mac, File Explorer on Windows.
 */
export const folderLabel = (os: ExecutionEnvironmentPlatformOs | undefined) =>
  os === "darwin" ? "Show in Finder" : os === "windows" ? "Show in File Explorer" : "Show in Files";

/**
 * Where a project's folder is, as a person reads it: the home folder written `~` ("~/Studio/bracket"),
 * on a Mac, on Windows (`C:\Users\amy\...`) and on Linux. Any other path stays as it is.
 */
export const folderPlace = (folder: string) =>
  folder.replace(/^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=$|[/\\])/, "~");
