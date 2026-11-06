import * as Base64 from "effect/encoding/Base64";
import * as Redacted from "effect/Redacted";

/**
 * The environment for one git process that talks to `remote` with `token`. The token rides in a
 * header for this process only, scoped to that remote: never in the URL, argv, or git config.
 * `config` adds other git settings for the same process.
 */
export function githubGitEnv(
  remote: string,
  token: Redacted.Redacted<string>,
  config: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const authorization = `AUTHORIZATION: basic ${Base64.encode(`x-access-token:${Redacted.value(token)}`)}`;
  const entries = [[`http.${remote}.extraheader`, authorization], ...Object.entries(config)];
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: String(entries.length),
    ...Object.fromEntries(
      entries.flatMap(([key = "", value = ""], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ),
  };
}
