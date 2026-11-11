/**
 * What Studio's server sends (`apps/server/src/telemetry/AnalyticsService.ts`), checked field by field and
 * turned into rows. Anything outside the contract is refused, not stored: an event not in `EVENTS` (the list
 * README.md's "Usage data" shows, which a test holds this to), a property that event does not carry
 * (`PROPERTIES`, which a test holds to the server's code), a value that is not a number, a boolean or a short
 * word, or a batch of the wrong shape. Nothing in a row names a person, a file or what they made: a short word
 * alone could be a file's name, so each value must come under a name kept here.
 *
 * A batch, schema 1:
 *
 *   { schema: 1, install, version, platform, arch, mode, events: [{ id, event, at, properties }] }
 *
 * `install` is the install's random id (a UUID made on the machine, `anonymous-id` in Studio's state), the one
 * thing an opt-out names (`/v1/forget`). Each event's `id` is a UUID of its own, made when it was counted, and
 * `at` when (ISO 8601): a sender that never heard back sends the batch again as it was, and the store passes
 * both on, so the store takes the copy for what it is.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A word, a model or version id, a few words of a fixed vocabulary: never a path, a line break or a sentence.
const WORD = /^[A-Za-z0-9_.+:@,()[\]/ -]{0,80}$/;
const PATHLIKE = /^[/~]|\\|^[A-Za-z]:|\/\//;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_EVENTS = 100;
const MAX_PROPERTIES = 40;
export const MAX_BYTES = 256 * 1024;

// What the connected client says of itself (`readClientAnalyticsProps` in the server's ws.ts).
const CLIENT = [
  "surface",
  "appVersion",
  "clientAppVersion",
  "clientOs",
  "os",
  "clientDeviceType",
  "webDeployment",
  "clientBrowser",
  "osMajorVersion",
  "clientOsMajorVersion",
  "deviceModel",
  "clientDeviceModel",
  "connectionMethod",
];
const CHATGPT = ["flow", "intent", "callbackMode"];
const CHATGPT_DONE = [
  ...CHATGPT,
  "outcome",
  "durationMs",
  "failureStage",
  "accountCountScope",
  "connectedAccountCount",
  "connectedConnectionCount",
  "savedConnectionCount",
  "unidentifiedConnectedConnectionCount",
];

/** Every event Studio can send, as README.md lists them, and the only properties each may carry. */
export const PROPERTIES = {
  "client.connected": CLIENT,
  // The AI a new chat starts with, by its kind (`claudeAgent`, `codex` and the rest).
  "client.thread.started": [...CLIENT, "provider"],
  "client.turn.requested": CLIENT,
  "provider.turn.completed": [
    "provider",
    "terminalStatus",
    "usageStatus",
    "usageScope",
    "hasSubagents",
    "inputTokens",
    "cachedInputTokens",
    "cacheCreationTokens",
    "outputTokens",
    "reasoningTokens",
    "model",
    "mixedModels",
    "effort",
    "runtimeMode",
    "interactionMode",
    "durationMs",
  ],
  "chatgpt.auth.started": CHATGPT,
  "chatgpt.auth.completed": CHATGPT_DONE,
  "chatgpt.transfer.started": CHATGPT,
  "chatgpt.transfer.completed": CHATGPT_DONE,
  "claude.signed_in": [],
  "studio.updated": ["from", "to"],
  "studio.skill.used": ["skill", "job", "how"],
  "studio.project.created": ["template", "origin"],
  "studio.project.trashed": [],
  "studio.project.restored": [],
  "studio.project.deleted": [],
  "studio.sync.sent": ["outcome"],
  "studio.sync.restored": ["outcome"],
  "studio.github.connected": [],
  "cad.model.opened": [],
  "cad.hand_edit": [],
  "cad.size.changed": [],
  "cad.size.added": [],
  "cad.versions.compared": [],
  "cad.version.restored": [],
  "cad.action.failed": ["action"],
};

export const EVENTS = new Set(Object.keys(PROPERTIES));

/** A batch outside the contract: its message names a field's path or a rule, never the value that broke it. */
export class Invalid extends Error {}

export const isUuid = (value) => typeof value === "string" && UUID.test(value);

const word = (value, at) => {
  if (typeof value !== "string" || !WORD.test(value) || PATHLIKE.test(value)) {
    throw new Invalid(`${at} is not a word`);
  }
  return value;
};

function propertiesOf(properties, allowed, at) {
  if (properties === undefined) return {};
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Invalid(`${at} is not an object`);
  }
  const entries = Object.entries(properties);
  if (entries.length > MAX_PROPERTIES) throw new Invalid(`${at} has too many properties`);
  const out = {};
  for (const [key, value] of entries) {
    // Named by the rule, not the key: a refused key is the sender's own text.
    if (!allowed.includes(key)) throw new Invalid(`${at} has a property this event does not carry`);
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Invalid(`${at}.${key} is not a number`);
      out[key] = value;
    } else out[key] = word(value, `${at}.${key}`);
  }
  return out;
}

const BATCH_KEYS = new Set(["schema", "install", "version", "platform", "arch", "mode", "events"]);
const EVENT_KEYS = new Set(["id", "event", "at", "properties"]);

/**
 * A batch as rows: one per event, each with the batch's context beside its own properties.
 * @returns {Array<{ id: string, event: string, at: string, install: string, version: string,
 *   platform: string, arch: string, mode: string, properties: Record<string, unknown> }>}
 */
export function rowsOf(batch) {
  if (batch === null || typeof batch !== "object" || Array.isArray(batch)) {
    throw new Invalid("the batch is not an object");
  }
  for (const key of Object.keys(batch)) {
    if (!BATCH_KEYS.has(key)) throw new Invalid(`unknown field ${key}`);
  }
  if (batch.schema !== 1) throw new Invalid("schema is not 1");
  if (!isUuid(batch.install)) throw new Invalid("install is not an id");
  const context = {
    install: batch.install.toLowerCase(),
    version: word(batch.version, "version"),
    platform: word(batch.platform, "platform"),
    arch: word(batch.arch, "arch"),
    mode: word(batch.mode, "mode"),
  };
  if (!Array.isArray(batch.events) || batch.events.length === 0) {
    throw new Invalid("events is not a list of events");
  }
  if (batch.events.length > MAX_EVENTS) throw new Invalid("events has too many events");
  const seen = new Set();
  return batch.events.map((event, index) => {
    const at = `events[${index}]`;
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      throw new Invalid(`${at} is not an object`);
    }
    for (const key of Object.keys(event)) {
      if (!EVENT_KEYS.has(key)) throw new Invalid(`${at} has unknown field ${key}`);
    }
    if (!isUuid(event.id)) throw new Invalid(`${at}.id is not an id`);
    if (seen.has(event.id.toLowerCase())) throw new Invalid(`${at}.id is sent twice`);
    seen.add(event.id.toLowerCase());
    if (!EVENTS.has(event.event)) throw new Invalid(`${at}.event is not one of Studio's events`);
    if (typeof event.at !== "string" || !ISO.test(event.at) || Number.isNaN(Date.parse(event.at))) {
      throw new Invalid(`${at}.at is not a time`);
    }
    return {
      id: event.id.toLowerCase(),
      event: event.event,
      at: event.at,
      ...context,
      properties: propertiesOf(event.properties, PROPERTIES[event.event], `${at}.properties`),
    };
  });
}
